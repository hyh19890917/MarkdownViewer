// OpenCascade.js 轻量封装：懒加载 full 构建（STEP/IGES 读取 + 网格化）
// 由 render.js 动态 import；仅在 3D 控件加载 .step/.stp/.iges/.igs 时初始化。
//
// wasm 以 gzip 压缩存放（opencascade.full.wasm.gz），运行时解压后以
// `wasmBinary` 直接交给 Emscripten，避免部署 48MB 未压缩文件。
import opencascade from "./opencascade.full.js";

let ocPromise = null;

function gunzip(buffer) {
    return new Response(
        new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))
    ).arrayBuffer();
}

export function initOpenCascade(wasmGzUrl) {
    if (ocPromise) return ocPromise;
    ocPromise = new Promise(function (resolve, reject) {
        fetch(wasmGzUrl).then(function (response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.arrayBuffer();
        }).then(function (gzBuffer) {
            if (typeof DecompressionStream !== "function") {
                throw new Error("当前 WebView2 运行时过旧，不支持 gzip 解压");
            }
            return gunzip(gzBuffer);
        }).then(function (wasmBinary) {
            return new opencascade({ wasmBinary: wasmBinary });
        }).then(function (oc) {
            resolve(oc);
        }, function (err) {
            reject(err);
        });
    });
    return ocPromise;
}
