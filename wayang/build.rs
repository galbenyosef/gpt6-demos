fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=macos/host.m");
        println!("cargo:rerun-if-changed=macos/wallpaper.h");
        println!("cargo:rerun-if-changed=macos/wallpaper.m");
        cc::Build::new()
            .file("macos/host.m")
            .file("macos/wallpaper.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("wyang_appkit");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
    }
}
