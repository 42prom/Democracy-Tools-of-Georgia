// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPhasedPaymaster {
    /**
     * @notice Verifies if the UserOp is allowed to be sponsored.
     * @param userOp The user operation.
     * @param userOpHash Hash of the operation.
     * @param maxCost Max gas cost.
     */
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);
}

interface IVoteAnchor {
    event BatchAnchored(uint256 indexed batchId, bytes32 merkleRoot, uint256 timestamp);

    function anchorBatch(uint256 batchId, bytes32 merkleRoot) external;
}
