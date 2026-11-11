/**
 * Contract templates for quick-start development.
 */

export const BLANK_CONTRACT = `# Contract: my_contract
# A blank Xian smart contract

@construct
def seed():
    """Called once when the contract is submitted."""
    pass

@export
def hello(name: str):
    """A simple exported function."""
    return f"Hello, {name}!"
`;

export const TOKEN_CONTRACT = `# XSC-001 Token Contract
# Implements the Xian token standard

balances = Hash(default_value=0)
approvals = Hash(default_value=0)
metadata = Hash()

@construct
def seed():
    metadata['token_name'] = 'My Token'
    metadata['token_symbol'] = 'MTK'
    metadata['token_logo_url'] = ''
    metadata['token_website'] = ''

    # Mint initial supply to the deployer
    balances[ctx.caller] = 1_000_000

@export
def change_metadata(key: str, value: Any):
    assert ctx.caller == ctx.this, 'Only the contract owner can change metadata'
    metadata[key] = value

@export
def transfer(amount: decimal, to: str):
    assert amount > 0, 'Cannot send non-positive amount'
    assert balances[ctx.caller] >= amount, 'Insufficient balance'

    balances[ctx.caller] -= amount
    balances[to] += amount

@export
def approve(amount: decimal, to: str):
    assert amount > 0, 'Cannot approve non-positive amount'
    approvals[ctx.caller, to] = amount

@export
def transfer_from(amount: decimal, to: str, main_account: str):
    assert amount > 0, 'Cannot send non-positive amount'
    assert approvals[main_account, ctx.caller] >= amount, 'Not enough approval'
    assert balances[main_account] >= amount, 'Insufficient balance'

    approvals[main_account, ctx.caller] -= amount
    balances[main_account] -= amount
    balances[to] += amount

@export
def balance_of(address: str):
    return balances[address]
`;

export const STORAGE_CONTRACT = `# Storage Contract Example
# Demonstrates Hash and Variable storage

owner = Variable()
data = Hash()
counter = Variable()

@construct
def seed():
    owner.set(ctx.caller)
    counter.set(0)

@export
def set_data(key: str, value: str):
    data[key] = value
    counter.set(counter.get() + 1)

@export
def get_data(key: str):
    return data[key]

@export
def get_count():
    return counter.get()
`;

export const TEMPLATES = [
  { id: "blank", name: "Blank Contract", code: BLANK_CONTRACT },
  { id: "token", name: "XSC-001 Token", code: TOKEN_CONTRACT },
  { id: "storage", name: "Storage Example", code: STORAGE_CONTRACT },
] as const;
