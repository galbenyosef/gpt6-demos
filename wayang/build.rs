fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=macos/host.m");
        println!("cargo:rerun-if-changed=macos/wallpaper.h");
        println!("cargo:rerun-if-changed=macos/wallpaper.m");
        println!("cargo:rerun-if-changed=macos/login.m");
        cc::Build::new()
            .file("macos/host.m")
            .file("macos/login.m")
            .file("macos/wallpaper.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("wyang_appkit");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=ServiceManagement");
    }
}
