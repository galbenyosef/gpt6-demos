#import <Foundation/Foundation.h>

@interface WYWallpaperMonitor : NSObject
- (instancetype)initWithIndex:(NSURL *)index display:(NSString *)display;
- (BOOL)selectionChangedWithFallback:(NSURL *(^)(void))desktopImage;
- (void)forgetSpaceURL;
@end
