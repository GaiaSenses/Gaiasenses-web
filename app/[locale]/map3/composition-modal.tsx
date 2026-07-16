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
                        <div className="absolute bottom-4 left-4">
                            {MuteButton}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}