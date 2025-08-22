use aztec::macros::aztec;

pub mod test;
pub mod types;

#[aztec]
pub contract OTCEscrow {
    // aztec library imports
    use crate::types::{
        escrow_definition_note::EscrowDefinitionNote,
        escrow_state_note::EscrowStateNote,
        maker_note::MakerNote,
    };
    use aztec::{
        context::PrivateContext,
        event::event_interface::{emit_event_in_private_log, PrivateLogContent},
        keys::{constants::INCOMING_INDEX, getters::get_public_keys},
        macros::{
            functions::{initializer, internal, private, public, utility, view},
            storage::storage,
            events::event
        },
        messages::logs::note::encode_and_encrypt_note,
        note::{constants::MAX_NOTES_PER_PAGE, note_viewer_options::NoteViewerOptions},
        prelude::{AztecAddress, PrivateImmutable, PrivateMutable, PrivateSet},
        protocol_types::traits::{Hash, Serialize},
    };

    use token_contract::Token;

    #[derive(Serialize)]
    #[event]
    struct ClaimAvailable {
        address: AztecAddress
    }

    #[storage]
    struct Storage<Context> {
        // defines the immutable parameters for executing the OTC order
        // shared with the contract decryption keys (all subscribed parties)
        definition: PrivateImmutable<EscrowDefinitionNote, Context>,

        // the random secret value used to control maker access to the escrow
        // only accessible by maker/ escrow creator
        maker_secret: PrivateImmutable<MakerNote, Context>,

        // current state of the escrow flow governing which function can be called
        // shared with the contract decryption keys (all subscribed parties)
        escrow_state: PrivateMutable<EscrowStateNote, Context>,
    }

    /**
     * Initializes a new OTC escrow contract
     *
     * @param decryption_service - the address of the decryption service that can leak notes
     *        TODO: ADD KEY LEAKING AT CONSTRAINED CONTRACT LEVEL
     * @param maker_token_address - the address of the ARC20 token being offered by the Maker
     * @param maker_token_amount - the amount of maker_tokens being offered by the Maker
     * @param taker_token_address - the address of the ARC20 token being asked for by the Maker
     * @param taker_token_amount - the amount of taker_tokens being asked for by the Maker
     */
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

    /**
     * Deposits the maker tokens into the escrow contract
     * @todo: either bundle this with constructor logic or should be bundled call with constructor
     *
     * @param _nonce - the AuthWit nonce used to authorize transfer_private_to_private
     */
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
        Token::at(definition.maker_token_address)
            .transfer_private_to_private(
                context.msg_sender(),
                self_address,
                definition.maker_token_amount,
                _nonce,
            )
            .call(&mut context);

        // 4, update escrow state
        escrow_state.advance_state();
        storage.escrow_state.replace(escrow_state).emit(encode_and_encrypt_note(
            &mut context,
            self_address,
            self_address,
        ));
    }

    /**
     * Deposits the taker tokens into the escrow contract and claims maker tokens
     *
     * @param _nonce - the AuthWit nonce used to authorize transfer_private_to_private
     */
    #[private]
    pub fn fill_order(_nonce: Field) {
        // 1. check the state is correct
        let mut escrow_state = storage.escrow_state.get_note().note;
        escrow_state.assert_swap_step();

        // 2. transfer taker_tokens from the taker to the escrow
        let definition = storage.definition.get_note();
        let self_address = context.this_address();
        Token::at(definition.taker_token_address)
            .transfer_private_to_private(
                context.msg_sender(),
                self_address,
                definition.taker_token_amount,
                _nonce,
            )
            .call(&mut context);
        
        // 3. transfer maker_tokens from the escrow to the caller
        Token::at(definition.maker_token_address)
            .transfer_private_to_private(
                self_address,
                context.msg_sender(),
                definition.taker_token_amount,
                0,
            )
            .call(&mut context);

        // 4. update escrow state
        escrow_state.advance_state();
        storage.escrow_state.replace(escrow_state).emit(encode_and_encrypt_note(
            &mut context,
            self_address,
            self_address,
        ));

        // 5. emit event notifying of claim availability
        // emit_event_in_private_log(
        //     ClaimAvailable { address: self_address },
        //     &mut context,
        //     self_address,
        //     PrivateLogContent.NO_CONSTRAINTS
        // )
    }

    /**
     * Claims the taker tokens from the escrow contract once taker has filled order
     */
    #[private]
    pub fn claim_order() {
        // 1. check that the user can recreate the commitment
        let definition = storage.definition.get_note();
        let maker_secret = storage.maker_secret.get_note();
        let expected_commitment = maker_secret.commitment_from_context(&mut context);
        assert(expected_commitment == definition.maker_commitment);

        // 2. check the state is correct
        let mut escrow_state = storage.escrow_state.get_note().note;
        escrow_state.assert_claim_step();

        // 3. transfer the taker tokens to the caller
        let self_address = context.this_address();
        Token::at(definition.taker_token_address)
            .transfer_private_to_private(
                self_address,
                context.msg_sender(),
                definition.taker_token_amount,
                0,
            )
            .call(&mut context);

        // 4. update escrow state
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
}
