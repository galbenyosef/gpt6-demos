#import "wallpaper.h"
#include <sys/stat.h>

static NSDictionary *dict(id value) {
    return [value isKindOfClass:NSDictionary.class] ? value : nil;
}

// WallpaperAgent can store the desktop and screen saver together ("Linked")
// or separately. Only the desktop choice and explicit selection date matter.
static NSDictionary *selection(id node) {
    NSDictionary *entry = dict(dict(node)[@"Desktop"]) ?: dict(dict(node)[@"Linked"]);
    NSArray *choices = dict(entry[@"Content"])[@"Choices"];
    if (![choices isKindOfClass:NSArray.class] || !choices.count) return nil;
    return @{@"choices": choices, @"set": entry[@"LastSet"] ?: NSNull.null};
}

static NSDictionary *displaySelection(id displays, NSString *uuid) {
    if (!uuid.length) return nil;
    for (NSString *key in dict(displays))
        if ([key caseInsensitiveCompare:uuid] == NSOrderedSame)
            return selection(displays[key]);
    return nil;
}

static NSDictionary *snapshot(NSDictionary *index, NSString *uuid) {
    // The empty key represents this display's default for Spaces that inherit it.
    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    result[@""] = displaySelection(index[@"Displays"], uuid)
        ?: selection(index[@"AllSpacesAndDisplays"]) ?: selection(index[@"SystemDefault"]);
    NSDictionary *spaces = dict(index[@"Spaces"]);
    for (NSString *key in spaces) {
        NSDictionary *space = dict(spaces[key]);
        result[key] = displaySelection(space[@"Displays"], uuid) ?: selection(space[@"Default"]) ?: result[@""];
    }
    return result.count ? result : nil;
}

static BOOL changed(NSDictionary *old, NSDictionary *now) {
    if (!old) return NO;
    // A Space removed by Mission Control no longer has a desktop to compare.
    for (NSString *scope in now) {
        NSDictionary *before = old[scope] ?: old[@""];
        NSDictionary *after = now[scope];
        if (!before) continue;
        if (![before[@"choices"] isEqual:after[@"choices"]]) return YES;
        // Copying an inherited choice into a new Space can give it a new date.
        if (old[scope] && ![before[@"set"] isEqual:after[@"set"]]) return YES;
    }
    return NO;
}

@implementation WYWallpaperMonitor {
    NSURL *_index;
    NSString *_display;
    NSDictionary *_previous;
    struct stat _readVersion;
    NSURL *_previousURL;
}
- (instancetype)initWithIndex:(NSURL *)index display:(NSString *)display {
    if ((self = [super init])) {
        _index = index;
        _display = [display copy];
    }
    return self;
}
- (void)forgetSpaceURL { _previousURL = nil; }
- (BOOL)selectionChangedWithFallback:(NSURL *(^)(void))desktopImage {
    // The store also identifies dynamic wallpapers for which AppKit may
    // return the same generic image. Reparse only after a write or replacement.
    struct stat version;
    if (stat(_index.fileSystemRepresentation, &version) == 0) {
        if (_previous && version.st_ino == _readVersion.st_ino &&
            version.st_mtimespec.tv_sec == _readVersion.st_mtimespec.tv_sec &&
            version.st_mtimespec.tv_nsec == _readVersion.st_mtimespec.tv_nsec)
            return NO;
        NSDictionary *now = snapshot([NSDictionary dictionaryWithContentsOfURL:_index error:nil], _display);
        if (now) {
            BOOL result = changed(_previous, now);
            _previous = now;
            _readVersion = version;
            _previousURL = nil;
            return result;
        }
    }
    // Older systems and unavailable stores use AppKit's per-screen image.
    NSURL *url = desktopImage();
    if (!url) return NO;
    BOOL result = _previousURL && ![_previousURL isEqual:url];
    _previousURL = url;
    return result;
}
@end
