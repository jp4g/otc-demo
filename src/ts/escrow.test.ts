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

describe("Counter Contract", () => {
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
        wad(10000, 6),
      )
      .send()
      .wait();
    console.log("Minted 10,000 USDC (Token A) to Alice");
    await tokenB
      .withWallet(minter)
      .methods.mint_to_private(
        minter.getAddress(),
        bob.getAddress(),
        wad(2, 18),
      )
      .send()
      .wait();
    console.log("Minted 2 WETH (Token B) to Bob");
  });

  beforeEach(async () => {
    let makerTokenAddress = alice.getAddress();
    let makerTokenAmount = 100n;
    let takerTokenAddress = alice.getAddress();
    let takerTokenAmount = 50n;
    let { contract, secretKey } = await deployEscrowContract(
      pxe1,
      alice,
      decryptionService.getAddress(),
      makerTokenAddress,
      makerTokenAmount,
      takerTokenAddress,
      takerTokenAmount,
    );
    escrow = contract;
    escrowKey = secretKey;
    console.log("Deployed new Escrow Contract");

    await pxe1.registerContract(escrow);
    await pxe2.registerContract(escrow);
    await pxe2.registerSender(escrow.address);
    await pxe2.registerSender(alice.getAddress());
  });

  it("e2e", async () => {
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
});
