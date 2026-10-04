// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @notice Deploys ClaimEscrow to Monad testnet.
/// @dev Testnet only (AGENT.md hard rule 3). Requires a funded deployer key:
///      MONAD_DEPLOYER_PRIVATE_KEY=0x... forge script contracts/script/Deploy.s.sol:Deploy \
///        --rpc-url monad_testnet --broadcast --verify
contract Deploy is Script {
    function run() external returns (ClaimEscrow escrow, MockERC20 token) {
        uint256 pk = vm.envUint("MONAD_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // MOCK test stablecoin (6 decimals, mirrors AUSD). AUSD has NO deployment on
        // Monad testnet (verified: eth_getCode at 0x0000...9012a returns 0x, 2026-10-04),
        // so per AGENT.md section 4 we use a clearly labeled test ERC-20 instead.
        token = new MockERC20("USD Coin (MOCK - test only)", "tUSD", 6);
        escrow = new ClaimEscrow();

        vm.stopBroadcast();

        console.log("Chain ID   :", block.chainid);
        console.log("Deployer   :", deployer);
        console.log("ClaimEscrow:", address(escrow));
        console.log("MockToken  :", address(token));
    }
}