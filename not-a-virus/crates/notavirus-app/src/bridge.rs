use notavirus_core::{Filter, Pack, TickOutput};
use notavirus_pack::LoadedPack;
use objc2::{rc::Retained, runtime::AnyObject};
use objc2_app_kit::NSPanel;
use objc2_core_foundation::{CFData, CFRetained, CGAffineTransform, CGPoint, CGRect, CGSize};
use objc2_core_graphics::*;
use objc2_quartz_core::*;
pub struct Renderer {
    pub layer: Retained<CALayer>,
    _image: CFRetained<CGImage>,
    last: std::cell::Cell<Option<(TickOutput, f64)>>,
}
impl Renderer {
    pub fn prepare(loaded: &mut LoadedPack) -> Result<Self, String> {
        // Decode yields straight RGBA. Premultiply exactly once at this boundary.
        for p in loaded.rgba.as_chunks_mut::<4>().0 {
            let alpha = u16::from(p[3]);
            for c in &mut p[..3] {
                *c = ((u16::from(*c) * alpha + 127) / 255) as u8;
            }
        }
        // CGImage consumes top-down PNG rows unchanged. The loader already
        // converted frame UVs to bottom-left; reversing the bytes here would
        // select the opposite atlas row and invert the sprite a second time.
        let stride = loaded.width as usize * 4;
        let data = CFData::from_bytes(&loaded.rgba);
        let provider =
            CGDataProvider::with_cf_data(Some(&data)).ok_or("cannot create image provider")?;
        let space = CGColorSpace::new_device_rgb().ok_or("cannot create color space")?;
        let image = unsafe {
            CGImage::new(
                loaded.width as usize,
                loaded.height as usize,
                8,
                32,
                stride,
                Some(&space),
                CGBitmapInfo(CGImageAlphaInfo::PremultipliedLast.0),
                Some(&provider),
                std::ptr::null(),
                false,
                CGColorRenderingIntent::RenderingIntentDefault,
            )
        }
        .ok_or("cannot create atlas image")?;
        let layer = CALayer::new();
        // CGImage is a CF/ObjC bridged image accepted by CALayer.contents.
        unsafe {
            layer.setContents(Some(&*((&*image as *const CGImage).cast::<AnyObject>())));
        }
        let filter = unsafe {
            if loaded.pack.filter == Filter::Nearest {
                kCAFilterNearest
            } else {
                kCAFilterLinear
            }
        };
        layer.setMagnificationFilter(filter);
        layer.setMinificationFilter(filter);
        Ok(Self {
            layer,
            _image: image,
            last: std::cell::Cell::new(None),
        })
    }
    pub fn attach(&self, panel: &NSPanel) {
        let view = panel.contentView().expect("panel content view");
        view.setWantsLayer(true);
        // AppKit owns the backing layer's geometry and may ignore/reset its
        // transform (including during snapshots). Keep the sprite as a child.
        let host = CALayer::new();
        view.setLayer(Some(&host));
        host.addSublayer(&self.layer);
    }
    pub fn apply(&self, panel: &NSPanel, pack: &Pack, out: TickOutput, backing: f64) {
        // A stationary panel needs no AppKit/Core Animation mutations between
        // animation frames. This also avoids waking the compositor at 60 Hz idle.
        if self.last.get() == Some((out, backing)) {
            return;
        }
        let previous = self.last.replace(Some((out, backing)));
        CATransaction::begin();
        CATransaction::setDisableActions(true);
        if previous.is_none_or(|(p, _)| {
            p.panel_origin != out.panel_origin || p.panel_size != out.panel_size
        }) {
            panel.setFrame_display(
                CGRect::new(
                    CGPoint::new(out.panel_origin.x, out.panel_origin.y),
                    CGSize::new(out.panel_size.x, out.panel_size.y),
                ),
                false,
            );
        }
        self.layer.setContentsScale(backing);
        self.layer.setBounds(CGRect::new(
            CGPoint::new(0., 0.),
            CGSize::new(out.panel_size.x, out.panel_size.y),
        ));
        self.layer.setAnchorPoint(CGPoint::new(0.5, 0.5));
        self.layer
            .setPosition(CGPoint::new(out.panel_size.x / 2., out.panel_size.y / 2.));
        let uv = out.frame.uv;
        self.layer.setContentsRect(CGRect::new(
            CGPoint::new(uv.origin.x, uv.origin.y),
            CGSize::new(uv.size.x, uv.size.y),
        ));
        // Mirror only the sprite child, leaving AppKit's backing geometry intact.
        let transform = CGAffineTransform {
            a: if out.flip_x { -1. } else { 1. },
            b: 0.,
            c: 0.,
            d: 1.,
            tx: if out.flip_x {
                pack.mirror_translation(out.scale)
            } else {
                0.
            },
            ty: 0.,
        };
        self.layer.setAffineTransform(transform);
        CATransaction::commit();
    }
}
