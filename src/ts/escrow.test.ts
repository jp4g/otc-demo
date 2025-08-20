import {
  OTCEscrowContract,
  OTCEscrowContractArtifact,
} from "../artifacts/OTCEscrow.js";
import {
  AccountWallet,
  CompleteAddress,
  PXE,
  AccountWalletWithSecretKey,
  Fr,
  createLogger,
  IntentAction,
} from "@aztec/aztec.js";
import {
  deployFundedSchnorrAccount,
  getInitialTestAccountsWallets,
} from "@aztec/accounts/testing";
import {
  deployEscrowContract,
  createPXE,
  deployTokenContract,
  TOKEN_METADATA,
  wad,
  depositTokens,
} from "./utils.js";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  getUnsafeSchnorrAccount,
  getUnsafeSchnorrWallet,
} from "@aztec/accounts/single_key";
import {
  getSponsoredFPCAddress,
  getSponsoredFPCInstance,
} from "./sponsored_fpc.js";
import { deploySchnorrAccount } from "./account.js";
import { TokenContract } from "../artifacts/Token.js";

describe("OTC Escrow Test", () => {
  let pxe1: PXE;
  let pxe2: PXE;

  let minter: AccountWallet;
  let decryptionService: AccountWallet;
  let alice: AccountWallet;
  let bob: AccountWallet;

  let escrow: OTCEscrowContract;
  let escrowKey: Fr;

  let tokenA: TokenContract;
  let tokenB: TokenContract;

  beforeAll(async () => {
    // setup PXEs
    [pxe1, pxe2] = await Promise.all([createPXE(), createPXE(1)]);

    // setup accounts
    const wallets = await getInitialTestAccountsWallets(pxe1);
    minter = wallets[0];
    decryptionService = wallets[1];
    alice = wallets[2];
    // idk why but getInitialTestAccounts doesn't work for pxe2
    bob = await (await deploySchnorrAccount(pxe2)).getWallet();
    console.log("Set up accounts");
    // deploy tokens
    tokenA = await deployTokenContract(TOKEN_METADATA.usdc, minter);
    console.log("Deployed token A");
    tokenB = await deployTokenContract(TOKEN_METADATA.weth, minter);
    console.log("Deployed token B");

    // mint tokens
    await tokenA
      .withWallet(minter)
      .methods.mint_to_private(
        minter.getAddress(),
        alice.getAddress(),
        wad(10000n, 6n),
      )
      .send()
      .wait();
    console.log("Minted 10,000 USDC (Token A) to Alice");
    await tokenB
      .withWallet(minter)
      .methods.mint_to_private(minter.getAddress(), bob.getAddress(), wad(2n))
      .send()
      .wait();
    console.log("Minted 2 WETH (Token B) to Bob");

    await pxe1.registerContract(tokenA);
    await pxe1.registerContract(tokenB);
    await pxe2.registerContract(tokenA);
    await pxe2.registerContract(tokenB);

    console.log("Minter address: ", minter.getAddress());
    console.log("Decryption Service Address: ", decryptionService.getAddress());
    console.log("Alice address: ", alice.getAddress());
    console.log("Bob address: ", bob.getAddress());
    console.log("Token A Address: ", tokenA.address);
    console.log("Token B Address: ", tokenB.address);

    let { contract, secretKey } = await deployEscrowContract(
      // deployer pxe/ wallet
      pxe1,
      alice,
      // decryption service to log to
      decryptionService.getAddress(),
      // maker token
      tokenA.address,
      new Fr(wad(4000n, 6n)),
      // taker token
      tokenB.address,
      new Fr(wad(1n)),
    );
    // todo: clean this up
    escrow = contract;
    escrowKey = secretKey;
    console.log("Deployed new Escrow Contract");

    await pxe1.registerContract(escrow);
    await pxe2.registerContract(escrow);
    await pxe2.registerSender(escrow.address);
    await pxe2.registerSender(alice.getAddress());
  });

  //   beforeEach(async () => {
  //     let { contract, secretKey } = await deployEscrowContract(
  //       // deployer pxe/ wallet
  //       pxe1,
  //       alice,
  //       // decryption service to log to
  //       decryptionService.getAddress(),
  //       // maker token
  //       tokenA.address,
  //       new Fr(wad(4000n, 6n)),
  //       // taker token
  //       tokenB.address,
  //       new Fr(wad(1n)),
  //       // token to create authwit for
  //       tokenA,
  //     );
  //     // todo: clean this up
  //     escrow = contract;
  //     escrowKey = secretKey;
  //     console.log("Deployed new Escrow Contract");

  //     await pxe1.registerContract(escrow);
  //     await pxe2.registerContract(escrow);
  //     await pxe2.registerSender(escrow.address);
  //     await pxe2.registerSender(alice.getAddress());
  //   });

  xit("Test escrow sharing", async () => {
    // Note for alice
    let aliceEscrowDefinition = await escrow
      .withWallet(alice)
      .methods.get_escrow_definition()
      .simulate();
    console.log("Escrow definition found for Alice:", aliceEscrowDefinition);

    // check if maker note exists
    let bobEscrowDefinition;
    try {
      bobEscrowDefinition = await escrow
        .withWallet(bob)
        .methods.get_escrow_definition()
        .simulate();
    } catch (error) {
      console.log("No escrow definition note found for Bob, as expected.");
    }

    // add account to bob pxe
    await pxe2.registerAccount(escrowKey, await escrow.partialAddress);
    await escrow.withWallet(bob).methods.sync_private_state().simulate();
    bobEscrowDefinition = await escrow
      .withWallet(bob)
      .methods.get_escrow_definition()
      .simulate();
    console.log("Escrow definition found for Bob:", bobEscrowDefinition);
  });

  it("Test deposit step", async () => {
    const aliceAmountBefore = await tokenA.methods
      .balance_of_private(alice.getAddress())
      .simulate();
    console.log("Alice's balance before deposit:", aliceAmountBefore);
    const escrowAmountBefore = await tokenA.methods
      .balance_of_private(escrow.address)
      .simulate();
    console.log("Escrow's balance before deposit:", escrowAmountBefore);

    // Deposit tokens into the escrow
    let amount = new Fr(wad(4000n, 6n));
    let nonce = Fr.random();
    console.log("amount: ", amount, ", bigint: ", amount.toBigInt());
    console.log("nonce: ", nonce, ", bigint: ", nonce.toBigInt());
    await depositTokens(alice, escrow, tokenA, amount, nonce);

    const aliceAmountAfter = await tokenA.methods
      .balance_of_private(alice.getAddress())
      .simulate();
    console.log("Alice's balance after deposit:", aliceAmountAfter);

    const escrowAmountAfter = await tokenA.methods
      .balance_of_private(escrow.address)
      .simulate();
    console.log("Escrow's balance after deposit:", escrowAmountAfter);
  });
});
