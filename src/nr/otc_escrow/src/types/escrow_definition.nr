use dep::aztec::{
    macros::notes::note,
    oracle::random::random,
    prelude::AztecAddress,
    protocol_types::{
        traits::{Deserialize, Serialize},
    },
};

// Defines all of the key values needed to execute an escrow transaction
#[derive(Eq, Serialize, Deserialize)]
pub struct EscrowDefinition {
    // private commitment to the maker of the escrow
    // also creates entropy that hides the note
    maker_commitment: Field,
    // address of the token that the maker is offering to sell
    maker_token_address: AztecAddress,
    // amount of the maker_token that the maker is offering to sell
    maker_token_amount: Field,
    // address of the token that the maker is trying to buy
    taker_token_address: AztecAddress,
    // amount of the taker_token that the maker is trying to buy
    taker_token_amount: Field
}


impl EscrowDefinition {
    pub fn new(
        maker_commitment: Field,
        maker_token_address: AztecAddress,
        maker_token_amount: Field,
        taker_token_address: AztecAddress,
        taker_token_amount: Field
    ) -> Self {
        EscrowDefinition { maker_commitment, maker_token_address, maker_token_amount, taker_token_address, taker_token_amount }
    }
}