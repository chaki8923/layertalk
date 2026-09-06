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

    let status = Command::new("xcrun")
        .args(["swiftc", "-module-cache-path"])
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
