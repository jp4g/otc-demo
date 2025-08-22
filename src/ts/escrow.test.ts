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

    // test send tokens to bob
    // await tokenA.withWallet(alice).methods.transfer_private_to_private(
    //   alice.getAddress(),
    //   bob.getAddress(),
    //   wad(10n, 6n),
    //   Fr.ZERO
    // ).send().wait();
    // console.log("sent bob funds")
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
    await pxe1.registerSender(escrow.address);
    await pxe1.registerSender(bob.getAddress());
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

  //   it("Test escrow sharing", async () => {
  //     // Note for alice
  //     let aliceEscrowDefinition = await escrow
  //       .withWallet(alice)
  //       .methods.get_escrow_definition()
  //       .simulate();
  //     console.log("Escrow definition found for Alice:", aliceEscrowDefinition);

  //     // check if maker note exists
  //     let bobEscrowDefinition;
  //     try {
  //       bobEscrowDefinition = await escrow
  //         .withWallet(bob)
  //         .methods.get_escrow_definition()
  //         .simulate();
  //     } catch (error) {
  //       console.log("No escrow definition note found for Bob, as expected.");
  //     }

  //     // add account to bob pxe
  //     await pxe2.registerAccount(escrowKey, await escrow.partialAddress);
  //     await escrow.withWallet(bob).methods.sync_private_state().simulate();
  //     bobEscrowDefinition = await escrow
  //       .withWallet(bob)
  //       .methods.get_escrow_definition()
  //       .simulate();
  //     console.log("Escrow definition found for Bob:", bobEscrowDefinition);
  //   });

  it("Dummy transfer out test", async () => {
    // transfer tokens in unconstrained
    await tokenA
      .withWallet(alice)
      .methods.transfer_private_to_private(
        alice.getAddress(),
        escrow.address,
        wad(10n, 6n),
        Fr.ZERO,
      )
      .send()
      .wait();
    console.log("Transferred tokens into escrow");
    let balanceAlice = await tokenA.methods
      .balance_of_private(alice.getAddress())
      .simulate();
    console.log("Alice's balance after transfer:", balanceAlice);
    let escrowBalance = await tokenA.methods
      .balance_of_private(escrow.address)
      .simulate();
    console.log("Escrow's balance after transfer:", escrowBalance);
    // sync state i guess?
    await escrow.withWallet(alice).methods.sync_private_state().simulate();
    console.log("Synced state");
    // transfer tokens out back to alice
    await escrow
      .withWallet(alice)
      .methods.dummy_transfer_out(
        tokenA.address,
        wad(10n, 6n),
        alice.getAddress(),
      )
      .send()
      .wait();
    console.log("Transferred tokens out of escrow");
    balanceAlice = await tokenA.methods
      .balance_of_private(alice.getAddress())
      .simulate();
    console.log("Alice's balance after transfer:", balanceAlice);
    escrowBalance = await tokenA.methods
      .balance_of_private(escrow.address)
      .simulate();
    console.log("Escrow's balance after transfer:", escrowBalance);
  });

  // it("Test deposit step", async () => {
  //   tokenA = tokenA.withWallet(alice);
  //   const aliceAmountBefore = await tokenA
  //     .methods
  //     .balance_of_private(alice.getAddress())
  //     .simulate();
  //   console.log("Alice's balance before deposit:", aliceAmountBefore);
  //   const escrowAmountBefore = await tokenA
  //     .methods
  //     .balance_of_private(escrow.address)
  //     .simulate();
  //   console.log("Escrow's balance before deposit:", escrowAmountBefore);

  //   // retrieve the escrow definition
  //   const definition = await escrow.withWallet(alice).methods.get_escrow_definition().simulate();
  //   console.log("Definition", definition)

  //   // Deposit tokens into the escrow
  //   let amount = new Fr(wad(4000n, 6n));
  //   let nonce = Fr.random();

  //   // create authwit
  //   // escrow = escrow.withWallet(alice);

  //   // const authwit = await alice.createAuthWit({
  //   //   caller: escrow.address,
  //   //   action: tokenA.methods.transfer_private_to_private(
  //   //     alice.getAddress(),
  //   //     bob.getAddress(),
  //   //     amount.toBigInt(),
  //   //     nonce,
  //   //   ),
  //   // });

  //   // await escrow
  //   //   .methods
  //   //   .deposit(bob.getAddress(), tokenA.address, amount.toBigInt(), nonce)
  //   //   .with({ authWitnesses: [authwit] })
  //   //   .send()
  //   //   .wait();
  //   const authwit = await alice.createAuthWit({
  //     caller: escrow.address,
  //     action: tokenA.methods.transfer_private_to_private(
  //       alice.getAddress(),
  //       escrow.address,
  //       amount.toBigInt(),
  //       nonce,
  //     ),
  //   });

  //   await escrow
  //     .methods
  //     .deposit(nonce)
  //     .with({ authWitnesses: [authwit] })
  //     .send()
  //     .wait();

  //   // await depositTokens(
  //   //   alice,
  //   //   escrow.withWallet(alice),
  //   //   tokenA,
  //   //   amount,
  //   //   nonce
  //   // );

  //   const aliceAmountAfter = await tokenA.methods
  //     .balance_of_private(alice.getAddress())
  //     .simulate();
  //   console.log("Alice's balance after deposit:", aliceAmountAfter);

  //   const escrowAmountAfter = await tokenA.methods
  //     .balance_of_private(escrow.address)
  //     .simulate();
  //   console.log("Escrow's balance after deposit:", escrowAmountAfter);
  // });
});
