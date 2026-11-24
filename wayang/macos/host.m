// AppKit placement and events only. Rust owns scene selection, timing and all rendering.
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <objc/runtime.h>

typedef struct {
    float x, y, logicalWidth, logicalHeight;
    uint32_t width, height;
    uint8_t paused, reduced, suspended, close;
} WYInput;

typedef void (*WYWake)(void *);
@interface WYHost : NSObject
@property NSWindow *window;
@property NSStatusItem *item;
@property NSMenuItem *pauseItem;
@property NSString *editor;
@property uint32_t identifier;
@property NSString *screenUUID;
@property BOOL detached;
@property BOOL paused, locked, sleeping, stopped, visible, fullscreen;
@property NSTimer *timer;
@property NSUInteger samples;
@property WYInput previous;
@property WYWake wake;
@property void *context;
@end

static NSScreen *screenFor(uint32_t identifier) {
    for (NSScreen *s in NSScreen.screens)
        if ([s.deviceDescription[@"NSScreenNumber"] unsignedIntValue] == identifier) return s;
    return nil;
}
static NSString *screenKey(uint32_t identifier) {
    CFUUIDRef uuid = CGDisplayCreateUUIDFromDisplayID(identifier);
    if (!uuid) return nil;
    NSString *value=CFBridgingRelease(CFUUIDCreateString(NULL,uuid));
    CFRelease(uuid); return value;
}
static BOOL neverKey(id self, SEL selector) { return NO; }
static void makeNonactivating(NSWindow *window) {
    // Retain winit's NSWindow implementation and veto AppKit key/main status.
    Class cls = object_getClass(window);
    NSString *name = [@"WYDesktop_" stringByAppendingString:NSStringFromClass(cls)];
    Class desktop = NSClassFromString(name);
    if (!desktop) {
        desktop = objc_allocateClassPair(cls,name.UTF8String,0);
        class_addMethod(desktop,@selector(canBecomeKeyWindow),(IMP)neverKey,"B@:");
        class_addMethod(desktop,@selector(canBecomeMainWindow),(IMP)neverKey,"B@:");
        objc_registerClassPair(desktop);
    }
    object_setClass(window,desktop);
}
static BOOL hasFullscreenWindow(CGDirectDisplayID screen) {
    CGRect bounds = CGDisplayBounds(screen);
    CFArrayRef infos = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
    for (NSDictionary *w in CFBridgingRelease(infos)) {
        if ([w[(id)kCGWindowLayer] intValue] != 0 || [w[(id)kCGWindowOwnerPID] intValue] == NSProcessInfo.processInfo.processIdentifier) continue;
        CGRect r;
        if (CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)w[(id)kCGWindowBounds], &r) && CGRectContainsRect(CGRectInset(r,-1,-1),bounds)) return YES;
    }
    return NO;
}

@implementation WYHost
- (void)openEditor:(id)sender {
    NSURL *bin = [NSURL fileURLWithPath:self.editor];
    NSURL *app = [[[bin URLByDeletingLastPathComponent] URLByDeletingLastPathComponent] URLByDeletingLastPathComponent];
    if ([app.pathExtension isEqual:@"app"])
        [NSWorkspace.sharedWorkspace openApplicationAtURL:app configuration:[NSWorkspaceOpenConfiguration configuration] completionHandler:nil];
    else {
        NSTask *task = [NSTask new]; task.executableURL = bin; [task launchAndReturnError:nil];
    }
}
- (void)pause:(id)sender { self.paused = !self.paused; self.pauseItem.title = self.paused ? @"Resume" : @"Pause"; [self tick]; }
- (void)stop:(id)sender { self.stopped = YES; [self tick]; }
- (void)sleep:(NSNotification *)n { self.sleeping = YES; [self tick]; }
- (void)wakeScreen:(NSNotification *)n { self.sleeping = NO; [self tick]; }
- (void)lock:(NSNotification *)n { self.locked = YES; [self tick]; }
- (void)unlock:(NSNotification *)n { self.locked = NO; [self tick]; }
- (void)geometry:(NSNotification *)n { self.samples = 0; [self tick]; }
- (void)tick {
    NSScreen *s = screenFor(self.identifier);
    WYInput input = {0};
    if (!s || ![screenKey(self.identifier) isEqual:self.screenUUID]) {
        s = nil;
        for (NSScreen *candidate in NSScreen.screens) {
            uint32_t ident = [candidate.deviceDescription[@"NSScreenNumber"] unsignedIntValue];
            if ([screenKey(ident) isEqual:self.screenUUID]) { s = candidate; self.identifier = ident; break; }
        }
    }
    input.close = self.stopped;
    if (!s) {
        input.suspended=YES;
        if (!self.detached) { [self.window orderOut:nil]; self.detached=YES; }
    } else if (self.detached) {
        self.detached=NO;
        [self.window orderFrontRegardless];
    }
    if (s) {
        NSRect r = s.frame;
        if (!NSEqualRects(self.window.frame,r)) [self.window setFrame:r display:NO];
        NSPoint p = NSEvent.mouseLocation;
        if (NSPointInRect(p,r)) {
            input.x = 2 * (p.x - r.origin.x)/r.size.width - 1;
            input.y = 1 - 2 * (p.y - r.origin.y)/r.size.height;
        }
        input.width = lround(r.size.width*s.backingScaleFactor);
        input.height = lround(r.size.height*s.backingScaleFactor);
        input.logicalWidth = r.size.width; input.logicalHeight = r.size.height;
        input.reduced = NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion;
        input.paused = self.paused;
        if (!self.locked && !self.sleeping && self.samples++ % 15 == 0) self.fullscreen = hasFullscreenWindow(self.identifier);
        input.suspended = self.locked || self.sleeping || self.fullscreen;
        if (input.suspended || input.reduced || input.paused) { input.x=0; input.y=0; }
    }
    if (memcmp(&input,&_previous,sizeof(input)) != 0) {
        _previous=input; self.wake(self.context);
    }
}
- (void)configure {
    NSWindow *w = self.window;
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    w.styleMask = NSWindowStyleMaskBorderless;
    makeNonactivating(w);
    w.level = CGWindowLevelForKey(kCGDesktopWindowLevelKey) + 1;
    w.ignoresMouseEvents = YES; w.hasShadow = NO; w.hidesOnDeactivate = NO;
    w.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorStationary |
       NSWindowCollectionBehaviorIgnoresCycle | NSWindowCollectionBehaviorFullScreenAuxiliary;
    w.animationBehavior = NSWindowAnimationBehaviorNone;
    w.excludedFromWindowsMenu = YES; w.backgroundColor = NSColor.blackColor;
    NSNotificationCenter *ws = NSWorkspace.sharedWorkspace.notificationCenter;
    [ws addObserver:self selector:@selector(sleep:) name:NSWorkspaceScreensDidSleepNotification object:nil];
    [ws addObserver:self selector:@selector(wakeScreen:) name:NSWorkspaceScreensDidWakeNotification object:nil];
    [ws addObserver:self selector:@selector(geometry:) name:NSWorkspaceActiveSpaceDidChangeNotification object:nil];
    [ws addObserver:self selector:@selector(geometry:) name:NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification object:nil];
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(geometry:) name:NSApplicationDidChangeScreenParametersNotification object:nil];
    NSDistributedNotificationCenter *dc = NSDistributedNotificationCenter.defaultCenter;
    [dc addObserver:self selector:@selector(lock:) name:@"com.apple.screenIsLocked" object:nil];
    [dc addObserver:self selector:@selector(unlock:) name:@"com.apple.screenIsUnlocked" object:nil];
    __weak WYHost *weakSelf=self;
    self.timer=[NSTimer scheduledTimerWithTimeInterval:1.0/30 repeats:YES block:^(NSTimer *t){ [weakSelf tick]; }];
    [self tick];
}
- (void)showMenu {
    if (self.item) return;
    self.item=[NSStatusBar.systemStatusBar statusItemWithLength:NSVariableStatusItemLength];
    self.item.button.title=@"Wyang";
    NSMenu *menu=[[NSMenu alloc] initWithTitle:@"Wyang"];
    NSMenuItem *target=[menu addItemWithTitle:screenFor(self.identifier).localizedName ?: @"Wallpaper" action:nil keyEquivalent:@""];
    target.enabled=NO;
    [menu addItem:NSMenuItem.separatorItem];
    [menu addItemWithTitle:@"Open Wyang" action:@selector(openEditor:) keyEquivalent:@""].target=self;
    self.pauseItem=[menu addItemWithTitle:@"Pause" action:@selector(pause:) keyEquivalent:@""];
    self.pauseItem.target=self;
    [menu addItemWithTitle:@"Stop" action:@selector(stop:) keyEquivalent:@""].target=self;
    self.item.menu=menu;
    [self.window orderFrontRegardless];
}
@end

bool wy_reduced(void) { @autoreleasepool { return NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion; } }
void *wy_attach(void *view,uint32_t display,const char *editor,WYWake wake, void *context) {
    if (!screenFor(display)) return NULL;
    WYHost *h=[WYHost new]; h.window=[(__bridge NSView *)view window]; h.identifier=display; h.screenUUID=screenKey(display);
    h.editor=[NSString stringWithUTF8String:editor]; h.wake=wake; h.context=context;
    [h configure]; return (__bridge_retained void *)h;
}
WYInput wy_input(void *ptr) { return [(__bridge WYHost *)ptr previous]; }
void wy_menu(void *ptr) { [(__bridge WYHost *)ptr showMenu]; }
void wy_release(void *ptr) {
    WYHost *h=CFBridgingRelease(ptr);
    [h.timer invalidate];
    [NSNotificationCenter.defaultCenter removeObserver:h];
    [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:h];
    [NSDistributedNotificationCenter.defaultCenter removeObserver:h];
    if (h.item) [NSStatusBar.systemStatusBar removeStatusItem:h.item];
    [h.window orderOut:nil];
}
