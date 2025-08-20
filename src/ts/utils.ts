import {
  waitForPXE,
  createPXEClient,
  AccountWallet,
  Contract,
  AztecAddress,
  FieldLike,
  PXE,
  Fr,
  deriveKeys,
  DeployOptions,
} from "@aztec/aztec.js";
import {
  OTCEscrowContract,
  OTCEscrowContractArtifact,
} from "../artifacts/OTCEscrow.js";
import { computePartialAddress } from "@aztec/stdlib/contract";
import { TokenContract, TokenContractArtifact } from "../artifacts/Token.js";

export const TOKEN_METADATA = {
  usdc: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
  },
  weth: {
    name: "Wrapped Ether",
    symbol: "WETH",
    decimals: 18,
  },
};

export const wad = (n: number = 1, decimals: number = 18) =>
  BigInt(n) * 10n ** BigInt(decimals);

export const createPXE = async (id: number = 0): Promise<PXE> => {
  const { BASE_PXE_URL = `http://localhost` } = process.env;
  const url = `${BASE_PXE_URL}:${8080 + id}`;
  const pxe = createPXEClient(url);
  await waitForPXE(pxe);
  return pxe;
};

export const setupSandbox = async () => {
  return createPXE();
};

/**
 * Deploys the Counter contract.
 * @param deployer - The wallet to deploy the contract with (essentially maker)
 * @param decryptionServiceAddress - The address of the decryption service.
 * @param makerTokenAddress - The address of the maker token.
 * @param makerTokenAmount - The amount of the maker token.
 * @param takerTokenAddress - The address of the taker token.
 * @param takerTokenAmount - The amount of the taker token.
 * @returns A deployed contract instance.
 */
export async function deployEscrowContract(
  pxe: PXE,
  deployer: AccountWallet,
  decryptionServiceAddress: AztecAddress,
  makerTokenAddress: AztecAddress,
  makerTokenAmount: FieldLike,
  takerTokenAddress: AztecAddress,
  takerTokenAmount: FieldLike,
  nonce: FieldLike = Fr.ZERO,
): Promise<{ contract: OTCEscrowContract; secretKey: Fr }> {
  // generate keys for the escrow contract
  const escrowSecretKey = Fr.random();
  const escrowPublicKeys = (await deriveKeys(escrowSecretKey)).publicKeys;

  // deploy the contract with generated keys
  const contractDeployment = await Contract.deployWithPublicKeys(
    escrowPublicKeys,
    deployer,
    OTCEscrowContractArtifact,
    [
      decryptionServiceAddress,
      makerTokenAddress,
      makerTokenAmount,
      takerTokenAddress,
      takerTokenAmount,
      nonce,
    ],
  );
  const partialAddress = await computePartialAddress(
    await contractDeployment.getInstance(),
  );
  // console.log("partial address 1: ", partialAddress.toString(), "|| secret key: ", escrowSecretKey.toString());
  let foundAddress1 = await pxe.registerAccount(
    escrowSecretKey,
    partialAddress,
  );
  // console.log("Found address 1: ", foundAddress1.address.toString());
  const contract = await contractDeployment.send().deployed();

  console.log("Escrow contract deployed at:", contract.address.toString());

  // register the contract account with the deployer
  return {
    contract: contract as OTCEscrowContract,
    secretKey: escrowSecretKey,
  };
}

export async function deployTokenContract(
  tokenMetadata: { name: string; symbol: string; decimals: number },
  deployer: AccountWallet,
  options?: DeployOptions,
): Promise<TokenContract> {
  const contract = await Contract.deploy(
    deployer,
    TokenContractArtifact,
    [
      tokenMetadata.name,
      tokenMetadata.symbol,
      tokenMetadata.decimals,
      deployer.getAddress(),
      AztecAddress.ZERO,
    ],
    "constructor_with_minter",
  )
    .send(options)
    .deployed();
  return contract as TokenContract;
}
