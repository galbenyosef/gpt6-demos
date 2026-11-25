#import <Foundation/Foundation.h>

@interface WYWallpaperMonitor : NSObject
- (instancetype)initWithIndex:(NSURL *)index display:(NSString *)display;
- (BOOL)selectionChangedWithFallback:(NSURL *(^)(void))desktopImage;
- (void)forgetSpaceURL;
@end

// Opaque, portable selection for the login helper. Comparison returns 1 for
// equal, 0 for changed, and -1 if the two observations cannot be compared.
NSString *WYSelectionAtIndex(NSURL *index, NSString *display, NSURL *(^fallback)(void));
int WYCompareSelections(NSString *before, NSString *after);
