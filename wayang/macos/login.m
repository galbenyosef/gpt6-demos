#import <AppKit/AppKit.h>
#import <ServiceManagement/ServiceManagement.h>
#import "wallpaper.h"

static NSString *agentPlist(void) {
    return [NSBundle.mainBundle.bundleIdentifier stringByAppendingString:@".restore.plist"];
}

static BOOL bundled(void) {
    NSBundle *app = NSBundle.mainBundle;
    return app.bundleIdentifier.length &&
        [app.bundleURL.pathExtension isEqual:@"app"];
}

// Negative results distinguish an unsupported OS and an unbundled editor.
int wy_login_status(void) { @autoreleasepool {
    if (@available(macOS 13, *)) {
        if (!bundled()) return -1;
        NSURL *plist = [[NSBundle.mainBundle.bundleURL URLByAppendingPathComponent:@"Contents/Library/LaunchAgents"] URLByAppendingPathComponent:agentPlist()];
        if (![plist checkResourceIsReachableAndReturnError:nil]) return SMAppServiceStatusNotFound;
        SMAppServiceStatus status = [SMAppService agentServiceWithPlistName:agentPlist()].status;
        // Before the first registration Service Management may not yet know the
        // packaged job. The plist is present, so allow the user to register it.
        return status == SMAppServiceStatusNotFound ? SMAppServiceStatusNotRegistered : (int)status;
    }
    return -2;
} }

char *wy_login_set(bool enabled) { @autoreleasepool {
    if (@available(macOS 13, *)) {
        if (!bundled()) return strdup("Open the packaged Wyang.app to change login settings.");
        SMAppService *service = [SMAppService agentServiceWithPlistName:agentPlist()];
        NSError *error = nil;
        BOOL ok = enabled ? [service registerAndReturnError:&error] : [service unregisterAndReturnError:&error];
        if (!ok && !(enabled && service.status == SMAppServiceStatusRequiresApproval))
            return strdup([NSString stringWithFormat:@"%@ (%@ %ld)", error.localizedDescription, error.domain, (long)error.code].UTF8String);
        return NULL;
    }
    return strdup("Resume at login requires macOS 13 or later.");
} }

void wy_login_settings(void) {
    if (@available(macOS 13, *)) [SMAppService openSystemSettingsLoginItems];
}

char *wy_display_uuid(uint32_t display) { @autoreleasepool {
    if (!CGDisplayIsOnline(display)) return NULL;
    CFUUIDRef uuid = CGDisplayCreateUUIDFromDisplayID(display);
    if (!uuid) return NULL;
    NSString *value = CFBridgingRelease(CFUUIDCreateString(NULL, uuid));
    CFRelease(uuid);
    return strdup(value.UTF8String);
} }

uint32_t wy_display_id(const char *key) { @autoreleasepool {
    CFUUIDRef uuid = CFUUIDCreateFromString(NULL, (__bridge CFStringRef)@(key));
    if (!uuid) return 0;
    // Enumerating the online displays establishes the WindowServer connection
    // also for a fresh command-line login helper with no AppKit windows.
    uint32_t count = 0, match = 0;
    if (CGGetActiveDisplayList(0, NULL, &count) == kCGErrorSuccess && count) {
        NSMutableData *buffer = [NSMutableData dataWithLength:count * sizeof(CGDirectDisplayID)];
        CGDirectDisplayID *ids = buffer.mutableBytes;
        if (CGGetActiveDisplayList(count, ids, &count) == kCGErrorSuccess) {
            for (uint32_t i = 0; i < count; ++i) {
                CFUUIDRef current = CGDisplayCreateUUIDFromDisplayID(ids[i]);
                if (current) {
                    if (CFEqual(current, uuid)) match = ids[i];
                    CFRelease(current);
                }
                if (match) break;
            }
        }
    }
    CFRelease(uuid);
    return match;
} }

char *wy_application_support(void) { @autoreleasepool {
    NSURL *dir = [NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject;
    return dir ? strdup(dir.fileSystemRepresentation) : NULL;
} }

char *wy_system_selection(uint32_t display, const char *key) { @autoreleasepool {
    NSURL *support = [NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject;
    NSURL *index = [support URLByAppendingPathComponent:@"com.apple.wallpaper/Store/Index.plist"];
    NSString *value = WYSelectionAtIndex(index, @(key), ^NSURL *{
        // NSScreen belongs to AppKit's main thread. A standalone login invocation
        // is already on that thread. Editor Apply runs on a worker.
        __block NSURL *url = nil;
        void (^read)(void) = ^{
            for (NSScreen *s in NSScreen.screens)
                if ([s.deviceDescription[@"NSScreenNumber"] unsignedIntValue] == display) {
                    url = [NSWorkspace.sharedWorkspace desktopImageURLForScreen:s];
                    break;
                }
        };
        if (NSThread.isMainThread) read(); else dispatch_sync(dispatch_get_main_queue(), read);
        return url;
    });
    return value ? strdup(value.UTF8String) : NULL;
} }

int wy_same_selection(const char *before, const char *after) { @autoreleasepool {
    return WYCompareSelections(@(before), @(after));
} }
