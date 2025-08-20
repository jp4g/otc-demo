use aztec::{
    context::PrivateContext,
    macros::notes::note,
    oracle::random::random,
    prelude::AztecAddress,
    protocol_types::traits::{Deserialize, Serialize, ToField},
};

#[note]
#[derive(Eq, Serialize, Deserialize)]
pub struct EscrowStateNote {
    owner: AztecAddress,
    state: u8,
    randomness: Field,
}

impl EscrowStateNote {
    pub fn new(owner: AztecAddress) -> Self {
        EscrowStateNote { owner, state: 1, randomness: unsafe { random() } }
    }

    pub fn assert_initialized(self) {
        assert(self.state != 0)
    }

    pub fn assert_deposit_step(self) {
        assert(self.state == 1)
    }

    pub fn assert_swap_step(self) {
        assert(self.state == 2)
    }

    pub fn assert_claim_step(self) {
        assert(self.state == 3)
    }

    pub fn assert_complete(self) {
        assert(self.state == 4)
    }

    pub fn advance_state(&mut self) {
        self.state = self.state + 1;
    }
}
