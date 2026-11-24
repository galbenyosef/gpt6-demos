fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=macos/host.m");
        cc::Build::new()
            .file("macos/host.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("wyang_appkit");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
    }
}
