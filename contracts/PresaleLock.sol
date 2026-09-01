// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PresaleLock
 * @notice Holds purchased OLC until exchange listing unlock. Tokens credited here are
 *         non-transferable by users until the owner calls `enableTrading()`.
 * @dev Deploy on BlockDAG Mainnet (chainId 1404). Fund with OLC via `deposit` (or
 *      transfer + track inventory), then operator/owner calls `credit(user, amount)`
 *      after a successful presale payment. Quest rewards are NOT locked here.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract PresaleLock {
    address public owner;
    address public operator;
    IERC20 public immutable olc;

    mapping(address => uint256) private _locked;
    uint256 public totalLocked;
    bool public tradingEnabled;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event Deposited(address indexed from, uint256 amount);
    event Credited(address indexed user, uint256 amount, uint256 newLockedBalance);
    event Withdrawn(address indexed user, uint256 amount);
    event TradingEnabled(address indexed by);
    event OwnerRescue(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyOwnerOrOperator() {
        require(msg.sender == owner || msg.sender == operator, "not authorized");
        _;
    }

    constructor(address olcToken) {
        require(olcToken != address(0), "olc=0");
        owner = msg.sender;
        operator = msg.sender;
        olc = IERC20(olcToken);
        emit OwnershipTransferred(address(0), msg.sender);
        emit OperatorUpdated(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner=0");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setOperator(address newOperator) external onlyOwner {
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    /** View locked OLC for a user (wei, 18 decimals). */
    function lockedBalance(address user) external view returns (uint256) {
        return _locked[user];
    }

    /** Owner/anyone can fund inventory via allowance. */
    function deposit(uint256 amount) external {
        require(amount > 0, "amount=0");
        require(olc.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Credit locked OLC to a buyer. Requires unallocated inventory:
     *         olc.balanceOf(this) >= totalLocked + amount.
     */
    function credit(address user, uint256 amount) external onlyOwnerOrOperator {
        require(user != address(0), "user=0");
        require(amount > 0, "amount=0");
        uint256 bal = olc.balanceOf(address(this));
        require(bal >= totalLocked + amount, "insufficient inventory");
        _locked[user] += amount;
        totalLocked += amount;
        emit Credited(user, amount, _locked[user]);
    }

    /**
     * @notice Pull OLC from `from` (with allowance) into this contract and credit `user`.
     *         Useful when the deliver key holds OLC and has approved this contract.
     */
    function creditFrom(address from, address user, uint256 amount) external onlyOwnerOrOperator {
        require(from != address(0) && user != address(0), "zero addr");
        require(amount > 0, "amount=0");
        require(olc.transferFrom(from, address(this), amount), "transferFrom failed");
        _locked[user] += amount;
        totalLocked += amount;
        emit Credited(user, amount, _locked[user]);
    }

    /** Owner unlocks withdrawals after OLC is listed on exchanges. Irreversible. */
    function enableTrading() external onlyOwner {
        require(!tradingEnabled, "already enabled");
        tradingEnabled = true;
        emit TradingEnabled(msg.sender);
    }

    /** User withdraws their full locked balance to self once trading is enabled. */
    function withdraw() external {
        require(tradingEnabled, "trading locked");
        uint256 amount = _locked[msg.sender];
        require(amount > 0, "nothing locked");
        _locked[msg.sender] = 0;
        totalLocked -= amount;
        require(olc.transfer(msg.sender, amount), "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Rescue unallocated OLC (balance above totalLocked). Cannot touch
     *         amounts already credited to users.
     */
    function rescueUnallocated(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "to=0");
        uint256 bal = olc.balanceOf(address(this));
        require(bal >= totalLocked + amount, "touches locked");
        require(olc.transfer(to, amount), "transfer failed");
        emit OwnerRescue(to, amount);
    }
}
