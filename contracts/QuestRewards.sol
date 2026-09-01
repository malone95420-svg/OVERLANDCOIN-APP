// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title QuestRewards
 * @notice Optional on-chain OLC reward pool for Overland quest completions.
 * @dev MVP payouts use a hot-wallet ERC-20 `transfer` from the server (`REWARD_PRIVATE_KEY`).
 *      Deploy this contract later on BlockDAG if you want pooled custody + signed claims.
 *
 * Flow (signed claim):
 *  1. Owner deposits OLC into this contract.
 *  2. Backend signs (to, amount, completionId, deadline) with EIP-191 / EIP-712.
 *  3. User (or relayer) calls `claim(...)` with the signature; completionId is burned once.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract QuestRewards {
    address public owner;
    IERC20 public immutable olc;
    mapping(bytes32 => bool) public claimed;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Deposited(address indexed from, uint256 amount);
    event Claimed(address indexed to, uint256 amount, bytes32 indexed completionId);
    event Withdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address olcToken) {
        require(olcToken != address(0), "olc=0");
        owner = msg.sender;
        olc = IERC20(olcToken);
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner=0");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /** Owner (or anyone) can fund the pool. */
    function deposit(uint256 amount) external {
        require(amount > 0, "amount=0");
        require(olc.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Claim OLC with an owner signature over the claim params.
     * @param to Recipient wallet
     * @param amount OLC wei (18 decimals)
     * @param completionId Unique quest completion id (bytes32)
     * @param deadline Unix timestamp; signature expires after
     * @param sig ECDSA signature from `owner` over eth_sign hash of the packed payload
     */
    function claim(
        address to,
        uint256 amount,
        bytes32 completionId,
        uint256 deadline,
        bytes calldata sig
    ) external {
        require(block.timestamp <= deadline, "expired");
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        require(!claimed[completionId], "already claimed");

        bytes32 payload = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(address(this), block.chainid, to, amount, completionId, deadline))
            )
        );
        address signer = _recover(payload, sig);
        require(signer == owner, "bad sig");

        claimed[completionId] = true;
        require(olc.transfer(to, amount), "transfer failed");
        emit Claimed(to, amount, completionId);
    }

    /** Simpler owner-only push payout (alternative to hot-wallet off-chain transfer). */
    function ownerPayout(address to, uint256 amount, bytes32 completionId) external onlyOwner {
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        require(!claimed[completionId], "already claimed");
        claimed[completionId] = true;
        require(olc.transfer(to, amount), "transfer failed");
        emit Claimed(to, amount, completionId);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "to=0");
        require(olc.transfer(to, amount), "transfer failed");
        emit Withdrawn(to, amount);
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "sig len");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "bad v");
        return ecrecover(hash, v, r, s);
    }
}
