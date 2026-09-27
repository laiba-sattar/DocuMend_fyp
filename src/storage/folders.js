/**
 * folders.js — folder reads and writes.
 *
 * "root" is not stored: it is the top level every document and folder
 * sits under when no other folder is chosen.
 */
import { db, newId } from './db';
import { queueUpsert } from '../sync/metadata';

export const ROOT_FOLDER = { id: 'root', name: 'Root level', meta: 'Main directory' };

export async function createFolder({ name, color = 'gold', parentId = 'root' }) {
  const folder = {
    id: newId(),
    name: name.trim(),
    color,
    parentId,
    createdAt: Date.now(),
  };
  await db.folders.add(folder);
  return folder;
}

/** A–Z by name. */
export function listFolders() {
  return db.folders.orderBy('name').toArray();
}

/**
 * Removes a folder. Nothing inside it is deleted: its documents and
 * sub-folders move up into the folder it was in, and the account is told where
 * the documents went. Returns the id they moved to.
 */
export async function deleteFolder(id) {
  if (!id || id === ROOT_FOLDER.id) return ROOT_FOLDER.id;
  let movedIds = [];
  let parentId = ROOT_FOLDER.id;
  await db.transaction('rw', db.folders, db.documents, async () => {
    const folder = await db.folders.get(id);
    parentId = folder?.parentId ?? ROOT_FOLDER.id;
    movedIds = await db.documents.where('folderId').equals(id).primaryKeys();
    await db.documents.where('folderId').equals(id).modify({ folderId: parentId });
    await db.folders.where('parentId').equals(id).modify({ parentId });
    await db.folders.delete(id);
  });
  movedIds.forEach(queueUpsert);
  return parentId;
}

/** Root first, then saved folders, each with a small "n files" line for the pickers. */
export async function listFolderOptions() {
  const [folders, documents] = await Promise.all([listFolders(), db.documents.toArray()]);
  const countIn = (id) => documents.filter((doc) => doc.folderId === id).length;
  const label = (n) => `${n} ${n === 1 ? 'file' : 'files'}`;
  return [
    ROOT_FOLDER,
    ...folders.map((folder) => ({ id: folder.id, name: folder.name, meta: label(countIn(folder.id)) })),
  ];
}
