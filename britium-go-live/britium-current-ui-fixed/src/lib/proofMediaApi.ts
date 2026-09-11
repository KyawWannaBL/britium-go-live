// @ts-nocheck
export async function loadProofMedia(filters: any = {}) {
  return {
    ok: true,
    rows: [],
    items: [],
    media: [],
    total: 0,
    row_count: 0,
    filters,
    source: "uat_empty_proof_media"
  };
}

export async function loadProofGallerySummary(filters: any = {}) {
  return {
    ok: true,
    rows: [],
    items: [],
    total: 0,
    row_count: 0,
    proof_count: 0,
    image_count: 0,
    signature_count: 0,
    video_count: 0,
    summary: {
      total: 0,
      proof_count: 0,
      image_count: 0,
      signature_count: 0,
      video_count: 0
    },
    filters,
    source: "uat_empty_proof_gallery_summary"
  };
}

export async function uploadProofDataUrl(payload: any = {}) {
  const dataUrl =
    typeof payload === "string"
      ? payload
      : payload.data_url || payload.dataUrl || payload.proof_photo || payload.image || "";

  const fileName =
    payload.file_name ||
    payload.fileName ||
    payload.name ||
    `proof-${Date.now()}.png`;

  return {
    ok: true,
    url: dataUrl,
    public_url: dataUrl,
    path: `uat-proof/${fileName}`,
    file_name: fileName,
    source: "uat_inline_data_url"
  };
}
