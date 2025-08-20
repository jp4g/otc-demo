use aztec::macros::aztec;

pub mod test;
pub mod types;

#[aztec]
pub contract OTCEscrow {
    // aztec library imports
    use crate::types::{
        escrow_definition_note::EscrowDefinitionNote,
        maker_note::MakerNote,
        escrow_state_note::EscrowStateNote
    };
    use aztec::{
        context::PrivateContext,
        keys::{constants::INCOMING_INDEX, getters::get_public_keys},
        macros::{
            functions::{initializer, internal, private, public, utility, view},
            storage::storage,
        },
        messages::logs::note::encode_and_encrypt_note,
        note::{constants::MAX_NOTES_PER_PAGE, note_viewer_options::NoteViewerOptions},
        prelude::{AztecAddress, PrivateImmutable, PrivateSet, PrivateMutable},
        protocol_types::traits::Hash,
    };

    use token_contract::Token;

    // @param owner The address of the owner
    // @param counter A numerical value
    #[storage]
    struct Storage<Context> {
        definition: PrivateImmutable<EscrowDefinitionNote, Context>,
        maker_secret: PrivateImmutable<MakerNote, Context>,
        escrow_state: PrivateMutable<EscrowStateNote, Context>
    }

    /// @dev Initialize the contract
    /// @param owner The address of the owner
    #[private]
    #[initializer]
    fn constructor(
        decryption_service: AztecAddress,
        maker_token_address: AztecAddress,
        maker_token_amount: u128,
        taker_token_address: AztecAddress,
        taker_token_amount: u128,
    ) {
        // 1. create the maker secret/ commitment
        let self_address = context.this_address();
        let maker_note = MakerNote::new(self_address);
        storage.maker_secret.initialize(maker_note).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
            context.msg_sender(),
        ));

        // 2. create the escrow definition
        let commitment = maker_note.commitment_from_context(&mut context);
        let escrow_definition_note = EscrowDefinitionNote::new(
            self_address,
            commitment,
            maker_token_address,
            maker_token_amount,
            taker_token_address,
            taker_token_amount,
        );
        storage.definition.initialize(escrow_definition_note).emit(encode_and_encrypt_note(
            &mut context,
            self_address,
            self_address,
        ));

        // 3. set up escrow state
        let escrow_state_note = EscrowStateNote::new(self_address);
        storage.escrow_state.initialize(escrow_state_note).emit(encode_and_encrypt_note(
            &mut context,
            self_address,
            self_address,
        ));
    }

    #[private]
    pub fn deposit(_nonce: Field) {
        // 1. check that the user can recreate the commitment
        let definition = storage.definition.get_note();
        let maker_secret = storage.maker_secret.get_note();
        let expected_commitment = maker_secret.commitment_from_context(&mut context);
        assert(expected_commitment == definition.maker_commitment);

        // 2. check the state is correct
        let mut escrow_state = storage.escrow_state.get_note().note;
        escrow_state.assert_deposit_step();

        // 3. initialize a token transfer into the contract
        let self_address = context.this_address();
        Token::at(definition.maker_token_address).transfer_private_to_private(
            context.msg_sender(),
            self_address,
            definition.maker_token_amount,
            _nonce
        ).call(&mut context);

        // 4, update escrow state
        escrow_state.advance_state();
        storage.escrow_state.replace(escrow_state).emit(encode_and_encrypt_note(
            &mut context,
            self_address,
            self_address,
        ));
    }

    #[utility]
    pub unconstrained fn view_maker_note() -> MakerNote {
        storage.maker_secret.view_note()
    }

    #[utility]
    pub unconstrained fn get_escrow_definition() -> EscrowDefinitionNote {
        storage.definition.view_note()
    }

    #[utility]
    pub unconstrained fn get_escrow_state() -> u8 {
        storage.escrow_state.view_note().state
    }

    // #[contract_library_function]
    // pub fn _only_maker(context: &mut PrivateContext) {
    //     let definition = storage.definition.get_note();
    //     let maker_secret = storage.maker_secret.get_note();
    //     let expected_commitment = maker_secret.commitment_from_context(&mut context);
    //     assert(expected_commitment == definition.maker_commitment);
    // }
}
