#import "../../macos/wallpaper.h"
#import <AppKit/AppKit.h>
#include <assert.h>

extern void *wy_attach(void *view, uint32_t display, const char *editor, void (*wake)(void *), void *context);
extern void wy_release(void *host);
static void wake(void *context) { ++*(int *)context; }

static NSDictionary *choice(NSString *name, int set) {
    return @{@"Content": @{@"Choices": @[@{@"Provider": @"test", @"Configuration": name}]},
             @"LastSet": [NSDate dateWithTimeIntervalSince1970:set]};
}

static void checkHiddenPlayerHost(void) {
    const char *home = getenv("CFFIXED_USER_HOME");
    assert(home);
    NSURL *dir = [[NSURL fileURLWithPath:@(home)] URLByAppendingPathComponent:@"Library/Application Support/com.apple.wallpaper/Store"];
    assert([NSFileManager.defaultManager createDirectoryAtURL:dir withIntermediateDirectories:YES attributes:nil error:nil]);
    NSURL *fixture = [dir URLByAppendingPathComponent:@"Index.plist"];
    assert(![fixture checkResourceIsReachableAndReturnError:nil]);
    assert([@{@"AllSpacesAndDisplays": @{@"Linked": choice(@"aerial", 10)}} writeToURL:fixture atomically:YES]);
    [NSApplication sharedApplication];
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 32, 32)
        styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
    NSScreen *screen = NSScreen.mainScreen;
    assert(screen);
    int wakes = 0;
    void *host = wy_attach((__bridge void *)window.contentView, [screen.deviceDescription[@"NSScreenNumber"] unsignedIntValue],
                           "/unused", wake, &wakes);
    assert(host);
    id player = (__bridge id)host;
    assert(![[player valueForKey:@"stopped"] boolValue] && !window.visible);
    assert([@{@"AllSpacesAndDisplays": @{@"Desktop": choice(@"photo", 20)}} writeToURL:fixture atomically:YES]);
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:4];
    while (![[player valueForKey:@"stopped"] boolValue] && deadline.timeIntervalSinceNow > 0)
        [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
    assert([[player valueForKey:@"stopped"] boolValue] && wakes && !window.visible);
    wy_release(host);
    puts("Hidden AppKit player host stopped on system selection");
}

int main(int argc, const char **argv) {
    @autoreleasepool {
        assert(argc == 2);
        if (strcmp(argv[1], "--host") == 0) { checkHiddenPlayerHost(); return 0; }
        // An unused temporary plist path supplied by the test runner.
        NSURL *index = [NSURL fileURLWithPath:@(argv[1])];
        WYWallpaperMonitor *monitor = [[WYWallpaperMonitor alloc] initWithIndex:index display:@"ABC"];
        NSURL * (^unused)(void) = ^NSURL *{ abort(); };
        BOOL (^observe)(NSDictionary *) = ^BOOL(NSDictionary *data) {
            assert([data writeToURL:index atomically:YES]);
            return [monitor selectionChangedWithFallback:unused];
        };
        NSDictionary *a = choice(@"aerial", 10), *b = choice(@"photo", 20);
        assert(!observe(@{@"AllSpacesAndDisplays": @{@"Linked": a}}));
        assert(![monitor selectionChangedWithFallback:unused]);
        NSString *saved = WYSelectionAtIndex(index, @"ABC", unused);
        assert(saved && WYCompareSelections(saved, saved) == 1);
        assert(!observe(@{@"AllSpacesAndDisplays": @{@"Desktop": a, @"Idle": b},
                          @"Displays": @{@"OTHER": @{@"Desktop": b}},
                          @"Spaces": @{@"first": @{@"Default": @{@"Desktop": a}}}}));
        assert(!observe(@{@"AllSpacesAndDisplays": @{@"Desktop": a},
                          @"Spaces": @{@"first": @{@"Displays": @{@"abc": @{@"Desktop": a}}}}}));
        assert(observe(@{@"AllSpacesAndDisplays": @{@"Desktop": a},
                         @"Spaces": @{@"first": @{@"Displays": @{@"abc": @{@"Desktop": b}}}}}));
        assert(observe(@{@"AllSpacesAndDisplays": @{@"Linked": a}, @"Spaces": @{@"first": @{}}}));
        assert(!observe(@{@"AllSpacesAndDisplays": @{@"Linked": a}}));
        assert(observe(@{@"AllSpacesAndDisplays": @{@"Linked": choice(@"aerial", 30)}}));
        assert(observe(@{@"AllSpacesAndDisplays": @"$null", @"Displays": @{@"abc": @{@"Desktop": b}}}));
        NSString *other = WYSelectionAtIndex(index, @"ABC", unused);
        assert(WYCompareSelections(saved, other) == 0);
        assert(WYCompareSelections(@"invalid", other) == -1);
        NSMutableDictionary *used = b.mutableCopy;
        used[@"LastUse"] = NSDate.date;
        assert(!observe(@{@"Displays": @{@"abc": @{@"Desktop": used}}}));

        // Simulate a partial rewrite, an older host, and an active Space change.
        assert([@"partial" writeToURL:index atomically:YES encoding:NSUTF8StringEncoding error:nil]);
        assert(![monitor selectionChangedWithFallback:^NSURL *{ return nil; }]);
        assert(!observe(@{@"Displays": @{@"abc": @{@"Desktop": b}}}));
        assert([NSFileManager.defaultManager removeItemAtURL:index error:nil]);
        NSURL * (^first)(void) = ^{ return [NSURL fileURLWithPath:@"/first.heic"]; };
        NSURL * (^second)(void) = ^{ return [NSURL fileURLWithPath:@"/second.heic"]; };
        NSString *legacy = WYSelectionAtIndex(index, @"ABC", first);
        assert(WYCompareSelections(saved, legacy) == -1);
        assert(WYCompareSelections(legacy, WYSelectionAtIndex(index, @"ABC", second)) == 0);
        assert(![monitor selectionChangedWithFallback:first]);
        [monitor forgetSpaceURL];
        assert(![monitor selectionChangedWithFallback:second]);
        assert([monitor selectionChangedWithFallback:first]);
        puts("macOS wallpaper selection checks passed");
    }
    return 0;
}
