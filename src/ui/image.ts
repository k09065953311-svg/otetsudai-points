import { ART_MAX_CHARS } from "../domain/rules";

/**
 * スマホで選んだ写真・イラストを、縦長（3:4）・最大 600×800 の JPEG に縮めて data URL にする。
 * 大きいままだと保存できない（Firestore は1件 1MB まで）ので、収まるまで画質を下げる。
 */
export async function imageToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("画像を読み込めませんでした"));
      i.src = url;
    });
    // 3:4 に切り抜く（横長なら左右を、縦に長すぎるなら下を削る。顔は上の方にあることが多いので上寄せ）
    const W = 600;
    const H = 800;
    const ratio = W / H;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    let sx = 0;
    if (sw / sh > ratio) {
      const nw = sh * ratio;
      sx = (sw - nw) / 2;
      sw = nw;
    } else {
      sh = sw / ratio;
    }
    const scale = Math.min(1, W / sw);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像を加工できませんでした");
    ctx.fillStyle = "#0b1022";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx, 0, sw, sh, 0, 0, canvas.width, canvas.height);
    for (const q of [0.86, 0.76, 0.64, 0.5]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if (data.length <= ART_MAX_CHARS) return data;
    }
    throw new Error("画像が大きすぎます");
  } finally {
    URL.revokeObjectURL(url);
  }
}
