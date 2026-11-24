// Inspect WindowServer geometry for the process launched by the smoke test.
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreGraphics/CoreGraphics.h>

static id attribute(id element, CFStringRef key) {
    CFTypeRef value = NULL;
    if (!element || AXUIElementCopyAttributeValue((__bridge AXUIElementRef)element, key, &value) != kAXErrorSuccess) return nil;
    return CFBridgingRelease(value);
}

static BOOL pressMenuItem(pid_t pid, NSString *title) {
    id app = CFBridgingRelease(AXUIElementCreateApplication(pid));
    NSArray *buttons = attribute(attribute(app, kAXExtrasMenuBarAttribute), kAXChildrenAttribute);
    // The detached helper owns exactly one status item.
    if (buttons.count != 1) return NO;
    id button = buttons.firstObject;
    if (AXUIElementPerformAction((__bridge AXUIElementRef)button, kAXPressAction) != kAXErrorSuccess) return NO;
    for (int i = 0; i < 20; i++) {
        for (id menu in attribute(button, kAXChildrenAttribute)) {
            for (id item in attribute(menu, kAXChildrenAttribute)) {
                if ([attribute(item, kAXTitleAttribute) isEqual:title])
                    return AXUIElementPerformAction((__bridge AXUIElementRef)item, kAXPressAction) == kAXErrorSuccess;
            }
        }
        [NSThread sleepForTimeInterval:0.05];
    }
    return NO;
}

int main(int argc, const char **argv) {
    @autoreleasepool {
        CGDirectDisplayID display = CGMainDisplayID();
        NSScreen *screen = nil;
        for (NSScreen *s in NSScreen.screens) {
            if ([s.deviceDescription[@"NSScreenNumber"] unsignedIntValue] == display) screen = s;
        }
        if (!screen) { fprintf(stderr, "No WindowServer display available\n"); return 1; }
        if (argc == 1) {
            printf("%u %ld %ld %.2f\n", display,
                   lround(screen.frame.size.width * screen.backingScaleFactor),
                   lround(screen.frame.size.height * screen.backingScaleFactor), screen.backingScaleFactor);
            return 0;
        }
        if (argc == 2 && strcmp(argv[1], "capture-access") == 0)
            return CGPreflightScreenCaptureAccess() ? 0 : 1;
        if (argc == 2 && strcmp(argv[1], "accessibility-access") == 0)
            return AXIsProcessTrusted() ? 0 : 1;
        if (argc == 4 && strcmp(argv[1], "menu") == 0)
            return pressMenuItem(atoi(argv[2]), [NSString stringWithUTF8String:argv[3]]) ? 0 : 1;
        if (argc != 3) return 1;
        if (strcmp(argv[1], "editor-pid") == 0) {
            NSURL *bundle = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[2]]];
            for (NSRunningApplication *app in [NSRunningApplication runningApplicationsWithBundleIdentifier:@"org.wyang.Editor"]) {
                if ([app.bundleURL.URLByResolvingSymlinksInPath.path isEqual:bundle.URLByResolvingSymlinksInPath.path]) {
                    printf("%d\n", app.processIdentifier);
                    return 0;
                }
            }
            return 1;
        }
        pid_t pid = atoi(argv[2]);
        if (strcmp(argv[1], "quit") == 0) return [[NSRunningApplication runningApplicationWithProcessIdentifier:pid] terminate] ? 0 : 1;
        BOOL player = strcmp(argv[1], "player") == 0;
        if (player && NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier == pid) {
            fprintf(stderr, "Player took keyboard focus\n");
            return 1;
        }
        NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID));
        BOOL inspect = strcmp(argv[1], "inspect") == 0;
        if (inspect) fprintf(stderr, "Expected %s at desktop level %d\n",
            NSStringFromRect(NSRectFromCGRect(CGDisplayBounds(display))).UTF8String,
            CGWindowLevelForKey(kCGDesktopWindowLevelKey) + 1);
        for (NSDictionary *w in windows) {
            if ([w[(id)kCGWindowOwnerPID] intValue] != pid) continue;
            int level = [w[(id)kCGWindowLayer] intValue];
            CGRect frame;
            if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)w[(id)kCGWindowBounds], &frame)) continue;
            if (inspect) {
                fprintf(stderr, "PID %d window %u, level %d, bounds %s\n", pid,
                    [w[(id)kCGWindowNumber] unsignedIntValue], level, NSStringFromRect(NSRectFromCGRect(frame)).UTF8String);
                continue;
            }
            if (player) {
                if (level != CGWindowLevelForKey(kCGDesktopWindowLevelKey) + 1 ||
                    level >= CGWindowLevelForKey(kCGDesktopIconWindowLevelKey) ||
                    !CGRectEqualToRect(frame, CGDisplayBounds(display))) continue;
            } else if (level != 0 || frame.size.width < 400) continue;
            printf("%u\n", [w[(id)kCGWindowNumber] unsignedIntValue]);
            return 0;
        }
        return 1;
    }
}
