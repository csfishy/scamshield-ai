window.scamShieldUi = {
    revealOnMobile(element, focusSelector) {
        if (!element || !window.matchMedia("(max-width: 850px)").matches) {
            return;
        }

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const focusTarget = focusSelector ? element.querySelector(focusSelector) : element;

        element.scrollIntoView({
            behavior: reducedMotion ? "auto" : "smooth",
            block: "start"
        });

        const focus = () => {
            if (!(focusTarget instanceof HTMLElement)) {
                return;
            }

            try {
                focusTarget.focus({ preventScroll: true });
            } catch {
                focusTarget.focus();
            }
        };

        if (reducedMotion) {
            focus();
        } else {
            window.setTimeout(focus, 280);
        }
    }
};
