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
        escrow_definition_note::EscrowDefinitionNote,
        maker_note::MakerNote,
    };

    use token_contract::Token;

    // @param owner The address of the owner
    // @param counter A numerical value
    #[storage]
    struct Storage<Context> {
        definition: PrivateImmutable<EscrowDefinitionNote, Context>,
        maker_secret: PrivateSet<MakerNote, Context>
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
        _nonce: Field
    ) {
        // 1. create the maker secret/ commitment
        let self_address = context.this_address();
        let maker_note = MakerNote::new(self_address);
        storage.maker_secret.insert(maker_note).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
            context.msg_sender()
        ));

        // 2. create the escrow definition
        let commitment = maker_note.commitment_from_context(&mut context);
        let escrow_definition_note = EscrowDefinitionNote::new(
            self_address,
            commitment,
            maker_token_address,
            maker_token_amount,
            taker_token_address,
            taker_token_amount
        );
        storage.definition.initialize(escrow_definition_note).emit(encode_and_encrypt_note(
            &mut context,
            self_address,
            self_address
        ));

        // 3. deposit tokens into the escrow
        Token::at(maker_token_address).transfer_private_to_private(
            context.msg_sender(),
            self_address,
            maker_token_amount,
            _nonce
        ).call(&mut context);

    }

    #[utility]
    pub unconstrained fn view_maker_note() -> BoundedVec<MakerNote, MAX_NOTES_PER_PAGE> {
        storage.maker_secret.view_notes(NoteViewerOptions::new())
    }

    #[utility]
    pub unconstrained fn get_escrow_definition() -> EscrowDefinitionNote {
        storage.definition.view_note()
    }
}
