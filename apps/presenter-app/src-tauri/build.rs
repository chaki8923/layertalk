fn main() {
    #[cfg(target_os = "macos")]
    build_storekit_bridge();
    tauri_build::build()
}

#[cfg(target_os = "macos")]
fn build_storekit_bridge() {
    use std::{env, path::PathBuf, process::Command};

    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let source = manifest.join("swift/StoreKitBridge.swift");
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let output = out_dir.join("StoreKitBridge.o");
    let module_cache = out_dir.join("SwiftModuleCache");
    println!("cargo:rerun-if-changed={}", source.display());
    for variable in ["MACOSX_DEPLOYMENT_TARGET", "DEVELOPER_DIR", "SDKROOT", "TOOLCHAINS"] {
        println!("cargo:rerun-if-env-changed={variable}");
    }

    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok("x86_64") => "x86_64",
        other => panic!("Unsupported macOS architecture: {other:?}"),
    };
    let deployment_target = env::var("MACOSX_DEPLOYMENT_TARGET")
        .expect("MACOSX_DEPLOYMENT_TARGET must match tauri.conf.json");
    let target = format!("{arch}-apple-macosx{deployment_target}");

    // Ask the selected compiler instead of assuming the full Xcode directory layout.
    // Command Line Tools installs Swift's compatibility libraries in a different location.
    let target_info = Command::new("xcrun")
        .args(["swiftc", "-target", &target, "-print-target-info"])
        .output()
        .expect("Could not query the Swift compiler");
    assert!(
        target_info.status.success(),
        "Could not query Swift target information: {}",
        String::from_utf8_lossy(&target_info.stderr)
    );
    let target_info: serde_json::Value = serde_json::from_slice(&target_info.stdout)
        .expect("Swift target information was not valid JSON");
    let library_paths = target_info["paths"]["runtimeLibraryPaths"]
        .as_array()
        .expect("Swift target information did not contain runtime library paths");
    for path in library_paths {
        let path = path.as_str().expect("Invalid Swift runtime library path");
        println!("cargo:rustc-link-search=native={path}");
    }

    let status = Command::new("xcrun")
        .args(["swiftc", "-target", &target, "-module-cache-path"])
        .arg(&module_cache)
        .args(["-parse-as-library", "-emit-object"])
        .arg(&source)
        .arg("-o")
        .arg(&output)
        .status()
        .expect("Xcode with the Swift compiler is required for the macOS StoreKit build");
    assert!(status.success(), "StoreKitBridge.swift did not compile");

    println!("cargo:rustc-link-arg={}", output.display());
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    println!("cargo:rustc-link-lib=dylib=swiftCore");
    println!("cargo:rustc-link-lib=framework=Foundation");
    println!("cargo:rustc-link-lib=framework=StoreKit");
}
