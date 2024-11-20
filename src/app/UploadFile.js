"use server";

import { promises as fs } from "fs";
import path from "path";
import { UnstructuredDirectoryLoader } from "@langchain/community/document_loaders/fs/unstructured";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

const collectionName = "prana";
const VECTOR_SIZE = 3072;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

async function ensureCollectionExists() {
  try {
    const collections = await client.getCollections();
    const collectionExists = collections.collections.some(
      (collection) => collection.name === collectionName
    );

    if (!collectionExists) {
      await client.createCollection(collectionName, {
        vectors: {
          size: VECTOR_SIZE,
          distance: "Cosine",
        },
      });
      console.log(`Collection ${collectionName} created successfully`);
    }
  } catch (error) {
    console.error("Error ensuring collection exists:", error);
    throw new Error("Failed to setup Qdrant collection");
  }
}

export async function uploadFile(file) {
  try {
    await ensureCollectionExists();

    const uploadDir = path.join(
      process.cwd(),
      "src",
      "app",
      // os.tmpdir(),
      "uploads"
    );
    console.log("Upload directory path:", uploadDir);

    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, file.name);
    console.log("File path:", filePath);

    try {
      await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
      console.log(`File successfully written to: ${filePath}`);

      // Check if the file exists after writing
      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      console.log(`File exists after writing: ${fileExists}`);

      if (!fileExists) {
        throw new Error("File does not exist after writing.");
      }
    } catch (err) {
      console.error("Error during file writing:", err);
      throw new Error("File write operation failed.");
    }

    const directoryExists = await fs
      .access(uploadDir)
      .then(() => true)
      .catch(() => false);
    console.log("Directory exists:", directoryExists);

    if (!directoryExists) {
      throw new Error(`Directory ${uploadDir} does not exist`);
    }

    const directoryLoader = new UnstructuredDirectoryLoader(uploadDir, {
      apiKey: "o1mEdVkM3472ddFIwJG6IpdNfeBfh4",
    });
    console.log("UnstructuredDirectoryLoader", directoryLoader);
    
    const directoryDocs = await directoryLoader.load();
    console.log("Number of documents loaded:", directoryDocs.length);

    const points = [];

    for (const doc of directoryDocs) {
      try {
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-3-large",
          input: doc.pageContent,
        });

        const embedding = embeddingResponse.data[0].embedding;

        if (embedding.length !== VECTOR_SIZE) {
          console.error(`Invalid embedding size: ${embedding.length}`);
          continue;
        }

        points.push({
          id: crypto.randomUUID(),
          vector: embedding,
          payload: {
            content: doc.pageContent,
            metadata: doc.metadata || {},
          },
        });
      } catch (error) {
        console.error("Error creating embedding:", error);
      }
    }

    if (points.length > 0) {
      try {
        await client.upsert(collectionName, {
          wait: true,
          points: points,
        });
        console.log(`Successfully upserted ${points.length} points`);
      } catch (error) {
        console.error("Error upserting points:", error);
        throw new Error("Failed to upsert points to Qdrant");
      }
    }

    return {
      success: true,
      filePath,
      message: `Successfully processed`,
    };
  } catch (error) {
    console.error("Error in uploadFile:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
