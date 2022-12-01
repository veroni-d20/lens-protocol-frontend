import { useContext, useRef, useState } from "react";
import { css } from "@emotion/css";
import { ethers, BigNumber, utils } from "ethers";
import { getSigner } from "../utils";
import {
  LENS_HUB_CONTRACT_ADDRESS,
  signCreatePostTypedData,
  createProfile,
  hasTxBeenIndexedQuery,
  createClient,
} from "../api";
import LENSHUB from "../abi/lenshub";
import { v4 as uuid } from "uuid";
import { refreshAuthToken, splitSignature } from "../utils";
export default function CreateProfileModal({ setIsModalOpen }) {
  const inputRef = useRef("");
  const imageRef = useRef("");
  const [handle, setHandle] = useState("");

  const hasTxBeenIndexed = async (input) => {
    console.log(input["txHash"]);
    const urqlClient = await createClient();
    const result = await urqlClient
      .query(
        `query HasTxHashBeenIndexed {
        hasTxHashBeenIndexed(request: { txHash: "${input["txHash"]}" } ) {
          ... on TransactionIndexedResult {
            indexed
            txReceipt {
              to
              from
              contractAddress
              transactionIndex
              root
              gasUsed
              logsBloom
              blockHash
              transactionHash
              blockNumber
              confirmations
              cumulativeGasUsed
              effectiveGasPrice
              byzantium
              type
              status
              logs {
                blockNumber
                blockHash
                transactionIndex
                removed
                address
                data
                topics
                transactionHash
                logIndex
              }
            }
            metadataStatus {
              status
              reason
            }
          }
          ... on TransactionError {
            reason
            txReceipt {
              to
              from
              contractAddress
              transactionIndex
              root
              gasUsed
              logsBloom
              blockHash
              transactionHash
              blockNumber
              confirmations
              cumulativeGasUsed
              effectiveGasPrice
              byzantium
              type
              status
              logs {
                blockNumber
                blockHash
                transactionIndex
                removed
                address
                data
                topics
                transactionHash
                logIndex
              }
            }
          },
          __typename
        }
      }`
      )
      .toPromise();

    console.log(result.data.hasTxHashBeenIndexed);

    return result.data.hasTxHashBeenIndexed;
  };

  const pollUntilIndexed = async (txHash) => {
    console.log(txHash);
    while (true) {
      const response = await hasTxBeenIndexed(txHash);
      console.log("pool until indexed: result", response);

      if (response.__typename === "TransactionIndexedResult") {
        console.log("pool until indexed: indexed", response.indexed);
        console.log(
          "pool until metadataStatus: metadataStatus",
          response.metadataStatus
        );

        console.log(response.metadataStatus);
        if (response.metadataStatus) {
          if (response.metadataStatus.status === "SUCCESS") {
            return response;
          }

          if (response.metadataStatus.status === "METADATA_VALIDATION_FAILED") {
            throw new Error(response.metadataStatus.status);
          }
        } else {
          if (response.indexed) {
            return response;
          }
        }

        console.log(
          "pool until indexed: sleep for 1500 milliseconds then try again"
        );
        // sleep for a second before trying again
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } else {
        // it got reverted and failed!
        throw new Error(response.reason);
      }
    }
  };

  async function postProfile() {
    try {
      const urqlClient = await createClient();
      console.log(inputRef.current.innerHTML);
      const response = await urqlClient
        .mutation(createProfile, {
          request: {
            handle: inputRef.current.innerHTML,
            profilePictureUri: null,
            followNFTURI: null,
            followModule: null,
          },
        })
        .toPromise();

      if (response.data.createProfile.__typename === "RelayError") {
        console.log(response.data.createProfile);
        console.error("create profile: failed");
        return;
      }

      console.log(response.data.createProfile.txHash);

      const indexResult = await pollUntilIndexed({
        txHash: response.data.createProfile.txHash,
      });

      const logs = indexResult.txReceipt.logs;

      const topicId = utils.id(
        "ProfileCreated(uint256,address,address,string,string,address,bytes,string,uint256)"
      );

      const profileCreatedLog = logs.find((l) => l.topics[0] === topicId);

      let profileCreatedEventLog = profileCreatedLog.topics;

      const profileId = utils.defaultAbiCoder.decode(
        ["uint256"],
        profileCreatedEventLog[1]
      )[0];

      console.log("profile id", BigNumber.from(profileId).toHexString());

      console.log("result:", result.data.createProfile);
    } catch (error) {
      console.log(error);
    }
  }
  return (
    <div className={containerStyle}>
      <div className={contentContainerStyle}>
        <div className={topBarStyle}>
          <div className={topBarTitleStyle}>
            <p>Create post</p>
          </div>
          <div onClick={() => setIsModalOpen(false)}>
            <img src="/close.svg" className={createPostIconStyle} />
          </div>
        </div>
        <div className={contentStyle}>
          <div className={bottomContentStyle}>
            <div className={postInputStyle} contentEditable ref={inputRef} />
            <div className={postInputStyle} contentEditable ref={imageRef} />
            <div className={buttonContainerStyle}>
              <button className={buttonStyle} onClick={postProfile}>
                Create Post
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const buttonStyle = css`
  border: none;
  outline: none;
  background-color: rgb(249, 92, 255);
  padding: 13px 24px;
  color: #340036;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.35s;
  &:hover {
    background-color: rgba(249, 92, 255, 0.75);
  }
`;

const buttonContainerStyle = css`
  display: flex;
  justify-content: flex-end;
  margin-top: 15px;
`;

const postInputStyle = css`
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 8px;
  width: 100%;
  min-height: 60px;
  padding: 12px 14px;
  font-weight: 500;
`;

const bottomContentStyle = css`
  margin-top: 10px;
  max-height: 300px;
  overflow: scroll;
`;

const topBarStyle = css`
  display: flex;
  align-items: flex-end;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding-bottom: 13px;
  padding: 15px 25px;
`;

const topBarTitleStyle = css`
  flex: 1;
  p {
    margin: 0;
    font-weight: 600;
  }
`;

const contentContainerStyle = css`
  background-color: white;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  width: 700px;
`;

const containerStyle = css`
  position: fixed;
  width: 100vw;
  height: 100vh;
  z-index: 10;
  top: 0;
  left: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.35);
  h1 {
    margin: 0;
  }
`;

const contentStyle = css`
  padding: 15px 25px;
`;

const createPostIconStyle = css`
  height: 20px;
  cursor: pointer;
`;
