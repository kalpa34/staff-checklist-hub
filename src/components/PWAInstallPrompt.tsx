import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Check if iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    // Listen for beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Show prompt after a delay
      const dismissed = localStorage.getItem('pwa-prompt-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  // Don't show if already installed
  if (isStandalone) return null;

  // Show iOS instructions
  if (isIOS && !showPrompt) {
    const dismissed = localStorage.getItem('pwa-prompt-dismissed');
    if (dismissed) return null;

    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4">
        <Card className="border-primary/20 bg-card/95 backdrop-blur-sm shadow-lg">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" />
                Install App
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={handleDismiss}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <CardDescription>
              Install Check List on your iPhone for the best experience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="text-sm text-muted-foreground space-y-1">
              <li>1. Tap the Share button <span className="inline-block">⎙</span></li>
              <li>2. Scroll down and tap "Add to Home Screen"</li>
              <li>3. Tap "Add" to install</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show Android/Desktop install prompt
  if (!showPrompt || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4">
      <Card className="border-primary/20 bg-card/95 backdrop-blur-sm shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              Install App
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={handleDismiss}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <CardDescription>
            Install Check List for offline access and notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" onClick={handleDismiss} className="flex-1">
            Maybe Later
          </Button>
          <Button onClick={handleInstall} className="flex-1 gradient-primary text-white">
            <Download className="w-4 h-4 mr-2" />
            Install
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
