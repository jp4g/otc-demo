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

        // Note for alice
        let aliceEscrowDefinition = await escrow.withWallet(alice).methods.get_escrow_definition().simulate();
        console.log("Escrow definition found for Alice:", aliceEscrowDefinition);

        // check if maker note exists
        let bobEscrowDefinition;
        try {
            bobEscrowDefinition = await escrow.withWallet(bob).methods.get_escrow_definition().simulate();
        } catch (error) {
            console.log("No escrow definition note found for Bob, as expected.");
        }
        
        // add account to bob pxe
        await pxe2.registerAccount(escrowKey, await escrow.partialAddress);
        await escrow.withWallet(bob).methods.sync_private_state().simulate()
        bobEscrowDefinition = await escrow.withWallet(bob).methods.get_escrow_definition().simulate();
        console.log("Escrow definition found for Bob:", bobEscrowDefinition);
    });
});