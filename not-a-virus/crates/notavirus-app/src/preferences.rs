use objc2_foundation::{NSString, NSUserDefaults, ns_string};
pub struct Preferences {
    pub active: String,
    pub scale: f64,
    pub paused: bool,
    defaults: objc2::rc::Retained<NSUserDefaults>,
}
impl Preferences {
    pub fn load() -> Self {
        Self::from_defaults(NSUserDefaults::standardUserDefaults())
    }
    pub fn from_defaults(d: objc2::rc::Retained<NSUserDefaults>) -> Self {
        let scale = d.doubleForKey(ns_string!("scale"));
        let p = Self {
            active: d
                .stringForKey(ns_string!("active_pack"))
                .map_or("default".into(), |s| s.to_string()),
            scale: if [1., 1.5, 2.].contains(&scale) {
                scale
            } else {
                1.
            },
            paused: d.boolForKey(ns_string!("paused")),
            defaults: d,
        };
        p.save();
        p
    }
    pub fn save(&self) {
        let d = &self.defaults;
        unsafe {
            d.setObject_forKey(
                Some(&NSString::from_str(&self.active)),
                ns_string!("active_pack"),
            );
        }
        d.setDouble_forKey(self.scale, ns_string!("scale"));
        d.setBool_forKey(self.paused, ns_string!("paused"));
        d.setBool_forKey(true, ns_string!("click_through"));
    }
}
