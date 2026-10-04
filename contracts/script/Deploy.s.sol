// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @notice Deploys ClaimEscrow to Monad testnet.
/// @dev Testnet only (AGENT.md hard rule 3). Requires a funded deployer key:
///      MONAD_DEPLOYER_PRIVATE_KEY=0x... forge script contracts/script/Deploy.s.sol:Deploy \
///        --rpc-url monad_testnet --broadcast --verify
contract Deploy is Script {
    function run() external returns (ClaimEscrow escrow) {
        uint256 pk = vm.envUint("MONAD_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        // MOCK test stablecoin (6 decimals, mirrors AUSD) — demo only.
        // Deploy the real AUSD dependency before the submission; see AGENT.md.
        MockERC20 token = new MockERC20("USD Coin (MOCK)", "USDC", 6);

        vm.startBroadcast(pk);
        escrow = new ClaimEscrow();
        vm.stopBroadcast();

        console.log("Chain ID   :", block.chainid);
        console.log("Deployer   :", deployer);
        console.log("ClaimEscrow:", address(escrow));
        console.log("MockToken  :", address(token));
    }
}