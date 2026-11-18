"use client";
import { AnimatePresence, motion } from "framer-motion"
import { ReactNode, useEffect, useRef } from "react"

type CompositionContainerProps = {
    isOpen:boolean,
    children:ReactNode,
    closeButton: ReactNode,
    MuteButton: ReactNode,
}

export default  function CompositionModal({isOpen, closeButton, children, MuteButton}:CompositionContainerProps){
    const closeRef = useRef<HTMLDivElement>(null);

    // ESC closes the composition exactly as the Back button does: it clicks
    // that same link, so both take one path. In fullscreen the browser uses
    // the ESC itself to leave fullscreen and the page never gets the key, so
    // leaving fullscreen while the composition is open counts as the same ESC.
    useEffect(() => {
        if (!isOpen) return;
        // Once: a browser that hands ESC to the page AND leaves fullscreen
        // would otherwise click Back twice.
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            closeRef.current?.querySelector<HTMLElement>("a, button")?.click();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.repeat || e.defaultPrevented) return;
            close();
        };
        const onFullscreen = () => {
            if (!document.fullscreenElement) close();
        };
        window.addEventListener("keydown", onKey);
        document.addEventListener("fullscreenchange", onFullscreen);
        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("fullscreenchange", onFullscreen);
        };
    }, [isOpen]);

    return (
        <div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="absolute w-svw h-svh top-0"
                        initial={{opacity:0}}
                        animate={{opacity:1}}
                        exit={{opacity:0}}
                        transition={{duration:1.5}}
                        >
                        {children}
                        {/* `closeButton` was accepted and never rendered, so the
                            Back button built in page.tsx never reached the screen
                            and the only way out was clicking the invisible
                            full-screen toggle overlay. */}
                        <div className="absolute bottom-4 left-4 flex items-center gap-2">
                            {MuteButton}
                            <div ref={closeRef} className="contents">{closeButton}</div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
