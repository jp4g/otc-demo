use aztec::macros::aztec;

pub mod test;
pub mod types;

#[aztec]
pub contract OTCEscrow {
    // aztec library imports
    use aztec::{
        context::PrivateContext,
        macros::{
            functions::{initializer, internal, private, public, view, utility},
            storage::storage
        },
        prelude::{AztecAddress, PrivateImmutable, PublicMutable, PrivateSet},
        messages::logs::note::encode_and_encrypt_note,
        keys::{
            getters::get_public_keys,
            constants::INCOMING_INDEX
        },
        protocol_types::traits::Hash,
        note::{
            constants::MAX_NOTES_PER_PAGE,
            note_viewer_options::NoteViewerOptions
        },
    };
    use crate::types::{
        escrow_definition::EscrowDefinition,
        maker_note::MakerNote,
    };

    // use token_contract::Token;

    // @param owner The address of the owner
    // @param counter A numerical value
    #[storage]
    struct Storage<Context> {
        definition: PrivateImmutable<EscrowDefinition, Context>,
        maker_secret: PrivateSet<MakerNote, Context>
    }

    /// @dev Initialize the contract
    /// @param owner The address of the owner
    #[private]
    #[initializer]
    fn constructor(
        decryption_service: AztecAddress,
        maker_token_address: AztecAddress,
        maker_token_amount: Field,
        taker_token_address: AztecAddress,
        taker_token_amount: Field,
        _nonce: Field
    ) {
        // 1. create the maker secret/ commitment
        let self_address = context.this_address();
        let maker_note = MakerNote::new(self_address);
        storage.maker_secret.insert(maker_note).emit(encode_and_encrypt_note(
            &mut context,
            self_address,
            self_address
        ));

        // 2. create the escrow definition
        let commitment = maker_note.commitment_from_context(&mut context);
        let escrow_definition = EscrowDefinition::new(
            commitment,
            maker_token_address,
            maker_token_amount,
            taker_token_address,
            taker_token_amount
        );
        // storage.definition.initialize(escrow_definition).emit(encode_and_encrypt_note(
        //     &mut context,
        //     self_address,
        //     self_address
        // ));

        // // 3. deposit tokens into the escrow
        // Token::at(maker_token_address).transfer_private_to_private(
        //     context.msg_sender(),
        //     self_address,
        //     maker_token_amount,
        //     _nonce
        // ).call(&mut context);

    }

    #[private]
    #[view]
    pub fn leak_keys() -> Field {
        // 2. log the decryption keys to the relevant parties
        let decryption_keys = get_public_keys(context.this_address());
        let nsk = context.request_nsk_app(decryption_keys.npk_m.hash());
        nsk
    }

    #[utility]
    pub unconstrained fn view_maker_note() -> BoundedVec<MakerNote, MAX_NOTES_PER_PAGE> {
        storage.maker_secret.view_notes(NoteViewerOptions::new())
    }

    // #[private]
    // #[view]
    // pub fn leak_keys_2() -> [Field; 2] {
    //     // 2. log the decryption keys to the relevant parties
    //     let decryption_keys = get_public_keys(context.this_address());
    //     let nsk = context.request_nsk_app(decryption_keys.npk_m.hash());
    //     let ovsk = context.request_ovsk_app(decryption_keys.ovpk_m.hash());
    //     [nsk, ovsk]
    // }

    // /// @dev Retrieves the owner of the contract
    // /// @return The owner of the contract
    // #[public]
    // fn get_owner() -> AztecAddress {
    //     storage.owner.read()
    // }

    // /// @dev Increments the counter
    // #[private]
    // fn increment() {
    //     Counter::at(context.this_address()).increment_internal().enqueue(&mut context);
    // }

    // /// @dev Retrieves the counter value
    // /// @return The current counter value
    // #[public]
    // fn get_counter() -> u128 {
    //     storage.counter.read()
    // }

    // #[contract_library_method]
    // fn _only_maker(context: &mut PrivateContext) {

    // }

    // /// @dev Increments the counter
    // #[public]
    // #[internal]
    // fn increment_internal() {
    //     let current_value = storage.counter.read();
    //     storage.counter.write(current_value + 1);
    // }
}
