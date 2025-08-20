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
import { deployFundedSchnorrAccount, getInitialTestAccountsWallets } from "@aztec/accounts/testing";
import { deployEscrowContract, createPXE } from "./utils.js";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getUnsafeSchnorrAccount, getUnsafeSchnorrWallet } from "@aztec/accounts/single_key";
import { getSponsoredFPCAddress, getSponsoredFPCInstance } from "./sponsored_fpc.js";
import { deploySchnorrAccount } from "./account.js";

describe("Counter Contract", () => {
    let pxe1: PXE;
    let pxe2: PXE;
    let wallets1: AccountWalletWithSecretKey[] = [];
    let accounts1: CompleteAddress[] = [];
    let wallets2: AccountWalletWithSecretKey[] = [];
    let accounts2: CompleteAddress[] = [];

    let decryptionService: AccountWallet;
    let alice: AccountWallet;
    let bob: AccountWallet;

    let escrow: OTCEscrowContract;
    let escrowKey: Fr;

    beforeAll(async () => {
        [pxe1, pxe2] = await Promise.all([
            createPXE(),
            createPXE(1)
        ]);

        const account2 = await deploySchnorrAccount(pxe2);
        bob = await account2.getWallet()

        wallets1 = await getInitialTestAccountsWallets(pxe1);
        accounts1 = wallets1.map((w) => w.getCompleteAddress());

        decryptionService = wallets1[0];
        alice = wallets1[1];
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
            takerTokenAmount
        );
        escrow = contract;
        escrowKey = secretKey;

        await pxe1.registerContract(escrow);
        await pxe2.registerContract(escrow);
        await pxe2.registerSender(escrow.address);
        await pxe2.registerSender(alice.getAddress());

        console.log("Alice address: ", alice.getAddress().toString());
        console.log("Bob address: ", bob.getAddress().toString());
        console.log("Escrow address: ", escrow.address.toString());
    });

    it("e2e", async () => {
        // await escrow.withWallet(alice).methods.sync_private_state().simulate();
        // const keys = escrow.withWallet(alice).instance.publicKeys;
        // const x = await escrow.withWallet(alice).methods.leak_keys().simulate();

        // console.log("x", x);
        // const x2 = await escrow.withWallet(alice).methods.leak_keys_2().simulate();
        // console.log("x2", x2);
        // const y = await escrow.withWallet(bob).methods.leak_keys();
        // console.log("y", y);

        // check no note exists
        let aliceMakerNote = await escrow.withWallet(alice).methods.view_maker_note().simulate();
        console.log("aliceMakerNote before", aliceMakerNote);


        // check if maker note exists
        let doesExist = await escrow.withWallet(bob).methods.view_maker_note().simulate();
        console.log("doesExistBefore", doesExist);
        // let makerNote = await escrow.withWallet(bob).methods.view_maker_note().simulate();
        // console.log("makerNote before", makerNote);

        // add account to bob pxe
        // console.log("PXE2 registered accounts before adding", (await pxe2.getRegisteredAccounts()))
        // console.log("partial address 2: ", await escrow.partialAddress, "|| secret key: ", escrowKey);

        let foundAddress2 = await pxe2.registerAccount(escrowKey, await escrow.partialAddress);
        // console.log("Found address 2: ", foundAddress2.address.toString());
        // console.log("PXE1 registered accounts", (await pxe1.getRegisteredAccounts()))
        // console.log("PXE2 registered accounts", (await pxe2.getRegisteredAccounts()))
        // console.log("Escrow address: ", escrow.address.toString());
        await escrow.withWallet(bob).methods.sync_private_state().simulate()
        doesExist = await escrow.withWallet(bob).methods.view_maker_note().simulate();
        console.log("doesExistAfter", doesExist);
        // makerNote = await escrow.methods.view_maker_not().simulate();
        // console.log("makerNote after", makerNote);
    });
});