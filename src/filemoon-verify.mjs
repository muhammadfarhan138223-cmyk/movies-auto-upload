/** Verify a FileMoon review job without sending any file bytes again.
 * A saved file may still be processing for streaming.
 */
export async function verifyFileMoonUpload({shareUrl,token,expectedName,expectedSize,fetchImpl=fetch}){
  if(typeof shareUrl!=='string'||shareUrl.length>2048)throw new Error('Copy the FileMoon Share link for the uploaded file.');
  let link;
  try{link=new URL(shareUrl.trim());}catch{throw new Error('Invalid FileMoon share URL');}
  if(link.protocol!=='https:'||!['filemoon.org','www.filemoon.org'].includes(link.hostname.toLowerCase())||link.username||link.password||link.port){
    throw new Error('Only official HTTPS filemoon.org links are accepted.');
  }
  // Documented FileMoon URLs: /{file-id}/file, /watch, /embed.
  const match=link.pathname.match(/^\/([A-Za-z0-9_-]{6,80})\/(file|watch|embed)\/?$/i);
  if(!match)throw new Error('Paste a FileMoon Share link such as https://filemoon.org/FILE_ID/file');
  if(typeof token!=='string'||!token.trim())throw new Error('FileMoon API token is not configured.');
  const id=match[1];
  const response=await fetchImpl('https://filemoon.org/api/v1/files/'+encodeURIComponent(id),{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)
  });
  if(!response.ok){
    if(response.status===401||response.status===403)throw new Error('FileMoon verification needs an API token with files:read permission.');
    throw new Error('FileMoon verification HTTP '+response.status+'. No job status was changed.');
  }
  let data;
  try{data=await response.json();}catch{throw new Error('Invalid FileMoon verification response.');}
  const file=data?.data?.file??data?.data;
  if(data?.success!==true||!file||typeof file!=='object'||String(file.id)!==id){
    throw new Error('FileMoon did not verify the exact file ID. No status changed.');
  }
  const remoteSize=Number(file.size_bytes);
  if(!Number.isSafeInteger(remoteSize)||remoteSize!==expectedSize){
    throw new Error('File size mismatch: local '+expectedSize+' bytes, FileMoon '+(Number.isFinite(remoteSize)?remoteSize:'unknown')+' bytes. No status changed.');
  }
  const remoteName=typeof file.filename==='string'?file.filename:typeof file.name==='string'?file.name:null;
  if(remoteName&&remoteName.trim().toLocaleLowerCase()!==String(expectedName).trim().toLocaleLowerCase()){
    throw new Error('FileMoon filename differs from the queued file. No status changed.');
  }
  return {id,url:'https://filemoon.org/'+encodeURIComponent(id)+'/file',
    processingNote:'Upload verified in FileMoon account; video conversion may still be pending.'};
}
