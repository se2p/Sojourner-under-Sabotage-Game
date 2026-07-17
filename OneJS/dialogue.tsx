import { List } from "System/Collections/Generic"
import { ScrollView, ScrollViewMode, ScrollerVisibility } from "UnityEngine/UIElements"
import { clamp } from "math"
import { emo } from "onejs/styled"
import { h } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { Tween, update } from "tweenjs"
const dialogueSystem = require("dialogueSystem")
const stompEventDelegation = require("stompEventDelegation")

const Dialogue = () => {
    const [isDialogueActive, setDialogueActive] = useState(false);
    const [index, setIndex] = useState(0)
    const [currentDialogue, setCurrentDialogue] = useState([])
    const scrollView = useRef()
    const focusElement = useRef()

    function showDialogue(dialogue: List<string> | Array<string>) {
        if (!(dialogue instanceof Array)) dialogue = dialogue.ToArray()
        if (dialogue.length === 0) {
            log("the given dialogue is empty")
            return
        }
        if (isDialogueActive) {
            log("a dialogue is already active")
            return
        }
        setCurrentDialogue(dialogue)
        setIndex(0)
        setDialogueActive(true)
    }

    function next() {
        if (!isDialogueActive) {
            log("Dialogue is not active")
            return
        }

        if (index + 1 < currentDialogue.length) {
            setIndex(index + 1)
        } else {
            setDialogueActive(false)
            stompEventDelegation.OnConversationFinished()
            dialogueSystem.EnableInteraction()
        }
    }

    useEffect(() => {
        /*// for testing
        showDialogue([
            "The component was attacked! But luckily your tests detected it soon enough.",
            "Now try to fix the component as soon as possible, so we can turn it back on!",
            "You can do it!",
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
            "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
            "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
            "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
        ])*/

        dialogueSystem.add_OnShowDialogue(showDialogue)

        onEngineReload(() => {  // Cleaning up for Live Reload
            dialogueSystem.remove_OnShowDialogue(showDialogue)
        })

        return () => {  // Cleaning up for side effect
            dialogueSystem.remove_OnShowDialogue(showDialogue)
        }
    }, [])

    useEffect(() => {
        if (scrollView.current) {
            // highValue must be re-read every frame: UIToolkit computes the layout for the page
            // that was just rendered only on a later frame, so a target sampled here would still
            // be the previous page's scroll end (dialogue appears one page behind / last page never
            // visible). Tween a progress value instead and chase the live highValue.
            const tween = new Tween({ t: 0 }).to({ t: 1 }, 4e2).onUpdate((o) => {
                if (scrollView.current) {
                    const scroller = ((scrollView.current as any).ve as ScrollView).verticalScroller
                    const target = Math.max(scroller.highValue, 0)
                    scroller.value = scroller.value + (target - scroller.value) * o.t
                }
            }).start()

            const animate = time => {
                if (tween.isPlaying()) {
                    update(time);
                    requestAnimationFrame(animate);
                }
            };
            requestAnimationFrame(animate);
        }
    }, [index, currentDialogue])

    useEffect(() => {
        if (focusElement.current && isDialogueActive) {
            (focusElement.current as any).focus()
        }
    }, [isDialogueActive])

    /*
    useEffect(() => {
        document.addRuntimeUSS(`
        `)
    }, [])
    */

    return (
        <div
            ref={focusElement}
            focusable={true}
            onKeyDown={e => {
                if (e.keyCode === 13) next()
            }}
            class={emo`
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            height: 100%;
            width: 100%;
            display: flex;
            justify-content: flex-end;
            align-items: flex-end;
        `}>
            <div class={emo`
                    width: 33%;
                    height: 33%;
                    min-height: 300px;
                    max-height: 100%;
                    background-color: #000;
                    display: flex;
                    justify-content: flex-end;
                    align-items: flex-end;
                    margin-right: 50px;
                    border-top-left-radius: 15px;
                    border-top-right-radius: 15px;

                    translate: ${isDialogueActive ? "0 0" : "0 100%"};
                    transition: translate .4s ease-in-out;
                `}>
                {isDialogueActive ? (
                    <scrollview
                        ref={scrollView}
                        mode={ScrollViewMode.Vertical}
                        vertical-scroller-visibility={ScrollerVisibility.Hidden}
                        horizontal-scroller-visibility={ScrollerVisibility.Hidden}
                        class={emo`
                        padding: 50px;
                        height: auto;
                        width: 100%;
                    `}>
                        {currentDialogue.map((text, i, a) => i <= index ? <div class={emo`
                            color: ${i === index ? "#fff" : "rgba(255, 255, 255, " + clamp(1 - ((index - i) / (index + 1)), .1, .75) + ")"};
                            font-size: 20px;
                            white-space: normal;
                            margin-top: ${i == 0 ? "300px" : index === i ? "35px" : "10px"};
                            transition: color .4s ease-in-out, scale .4s ease-in-out;
                            scale: ${i === index ? "1" : "0.75"};
                            transform-origin: left;
                            width: 100%;
                        `}>
                            {text}
                        </div> : null)}
                    </scrollview>
                ) : null}
            </div>
        </div>
    )
}

export default Dialogue