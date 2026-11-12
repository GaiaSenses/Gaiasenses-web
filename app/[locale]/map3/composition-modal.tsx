"use client";
import { AnimatePresence, motion } from "framer-motion"
import { ReactNode } from "react"

type CompositionContainerProps = {
    isOpen:boolean,
    children:ReactNode,
    closeButton: ReactNode,
    MuteButton: ReactNode,
}

export default  function CompositionModal({isOpen, closeButton, children, MuteButton}:CompositionContainerProps){

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
                            {closeButton}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}