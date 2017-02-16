// @flow
import { DOM as dom, PropTypes, createClass } from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import ImPropTypes from "react-immutable-proptypes";
import classnames from "classnames";
import actions from "../../actions";
import {
  getSource,
  getPause,
  getBreakpoints,
  getShouldPauseOnExceptions,
  getShouldIgnoreCaughtExceptions,
} from "../../selectors";
import { makeLocationId } from "../../reducers/breakpoints";
import { endTruncateStr } from "../../utils/utils";
import { basename } from "../../utils/path";
import CloseButton from "../shared/Button/Close";
import { isEnabled } from "devtools-config";
import showMenu from "../shared/menu";

import "./Breakpoints.css";

import type { Breakpoint } from "../../types";

type LocalBreakpoint = Breakpoint & {
  location: any,
  isCurrentlyPaused: boolean,
  locationId: string
}

function isCurrentlyPausedAtBreakpoint(state, breakpoint) {
  const pause = getPause(state);
  if (!pause || pause.get("isInterrupted")) {
    return false;
  }

  const bpId = makeLocationId(breakpoint.location);
  const pausedId = makeLocationId(
    pause.getIn(["frame", "location"]).toJS()
  );

  return bpId === pausedId;
}

function renderSourceLocation(source, line) {
  const url = source.get("url") ? basename(source.get("url")) : null;
  // const line = url !== "" ? `: ${line}` : "";
  return url ?
    dom.div(
      { className: "location" },
      `${endTruncateStr(url, 30)}: ${line}`
    ) : null;
}

const Breakpoints = createClass({
  propTypes: {
    breakpoints: ImPropTypes.map.isRequired,
    enableBreakpoint: PropTypes.func.isRequired,
    disableBreakpoint: PropTypes.func.isRequired,
    selectSource: PropTypes.func.isRequired,
    removeBreakpoint: PropTypes.func.isRequired,
    pauseOnExceptions: PropTypes.func.isRequired,
    exceptionPauseModes: PropTypes.array.isRequired,
    currentExceptionPauseMode: PropTypes.object.isRequired,
  },

  displayName: "Breakpoints",

  shouldComponentUpdate(nextProps, nextState) {
    const { breakpoints, currentExceptionPauseMode } = this.props;
    return breakpoints !== nextProps.breakpoints || currentExceptionPauseMode !== nextProps.currentExceptionPauseMode;
  },

  handleCheckbox(breakpoint) {
    if (breakpoint.loading) {
      return;
    }

    if (breakpoint.disabled) {
      this.props.enableBreakpoint(breakpoint.location);
    } else {
      this.props.disableBreakpoint(breakpoint.location);
    }
  },

  selectBreakpoint(breakpoint) {
    const sourceId = breakpoint.location.sourceId;
    const line = breakpoint.location.line;
    this.props.selectSource(sourceId, { line });
  },

  removeBreakpoint(event, breakpoint) {
    event.stopPropagation();
    this.props.removeBreakpoint(breakpoint.location);
  },

  pauseExceptionModeToggled(event) {
    const { pauseOnExceptions, exceptionPauseModes } = this.props;

    const targetMode = exceptionPauseModes.filter(
      item => item.mode === event.target.value
    )[0];

    pauseOnExceptions(targetMode.shouldPause, targetMode.shouldIgnoreCaught);
  },

  renderExceptionBreakpoints() {
    const currentMode = this.props.currentExceptionPauseMode;
    const _createToggle = (fromMode) => {
      const checked = currentMode.mode === fromMode.mode;

      return dom.label({
        className: "breakpoint",
        key: fromMode.mode
        },
        dom.input({
          type: "radio",
          name: "exception-mode",
          onChange: this.pauseExceptionModeToggled,
          value: fromMode.mode,
          checked
        }),
        dom.span({
          className: "breakpoint-label"
        },
          fromMode.label
        )
      );
    };

    return dom.details(null,
      dom.summary(null,
        `Exceptions - Pausing on: ${currentMode.headerLabel}`
      ),
      this.props.exceptionPauseModes.map(_createToggle)
    );
  },

  renderExceptionDropdown() {
    const _createToggle = (fromMode) => {
      const currentMode = this.props.currentExceptionPauseMode;
      return {
        value: fromMode.mode,
        label: fromMode.label,
        disabled: currentMode.mode === fromMode.mode,
        click: () => {
          this.props.pauseOnExceptions(fromMode.shouldPause, fromMode.shouldIgnoreCaught);
        }
      };
    };

    const onClick = (event) => {
      showMenu(event, this.props.exceptionPauseModes.map(_createToggle));
    };
    return dom.button({
      onClick,
      className: "exception-mode-trigger"
    }, "Pause on...");
  },

  renderBreakpoint(breakpoint) {
    const snippet = breakpoint.text || "";
    const locationId = breakpoint.locationId;
    const line = breakpoint.location.line;
    const isCurrentlyPaused = breakpoint.isCurrentlyPaused;
    const isDisabled = breakpoint.disabled;
    const isConditional = breakpoint.condition !== null;

    return dom.div(
      {
        className: classnames({
          breakpoint,
          paused: isCurrentlyPaused,
          disabled: isDisabled,
          "is-conditional": isConditional
        }),
        key: locationId,
        onClick: () => this.selectBreakpoint(breakpoint)
      },
      dom.input({
        type: "checkbox",
        className: "breakpoint-checkbox",
        checked: !isDisabled,
        onChange: () => this.handleCheckbox(breakpoint),
        // Prevent clicking on the checkbox from triggering the onClick of
        // the surrounding div
        onClick: (ev) => ev.stopPropagation()
      }),
      dom.div(
        { className: "breakpoint-label", title: breakpoint.text },
        dom.div({}, renderSourceLocation(breakpoint.location.source, line))
      ),
      dom.div({ className: "breakpoint-snippet" }, snippet),
      CloseButton({
        handleClick: (ev) => this.removeBreakpoint(ev, breakpoint),
        tooltip: L10N.getStr("breakpoints.removeBreakpointTooltip")
      }));
  },

  render() {
    const { breakpoints } = this.props;

    const showDropdownExceptions = isEnabled("dropdownExceptionPausing") && ! isEnabled("inlineExceptionPausing");

    return dom.div(
      { className: "pane breakpoints-list" },
      showDropdownExceptions ? this.renderExceptionDropdown() : null,
      isEnabled("inlineExceptionPausing") ? this.renderExceptionBreakpoints() : null,
      (breakpoints.size === 0 ?
       dom.div({ className: "pane-info" }, L10N.getStr("breakpoints.none")) :
       breakpoints.valueSeq().map(this.renderBreakpoint))
    );
  }
});

function updateLocation(state, bp): LocalBreakpoint {
  const source = getSource(state, bp.location.sourceId);
  const isCurrentlyPaused = isCurrentlyPausedAtBreakpoint(state, bp);
  const locationId = makeLocationId(bp.location);

  const location = Object.assign({}, bp.location, {
    source
  });

  const localBP = Object.assign({}, bp, {
    location,
    locationId,
    isCurrentlyPaused
  });

  return localBP;
}

function _getBreakpoints(state) {
  return getBreakpoints(state)
  .map(bp => updateLocation(state, bp))
  .filter(bp => bp.location.source);
}

/*
 * The pause on exception feature has three states in this order:
 *  1. don't pause on exceptions      [false, false]
 *  2. pause on uncaught exceptions   [true, true]
 *  3. pause on all exceptions        [true, false]
 */

function _getModes() {
  return [
    {
      mode: "no-pause",
      label: "Do not pause on exceptions.",
      headerLabel: "None",
      shouldPause: false,
      shouldIgnoreCaught: false,
    },
    {
      mode: "no-caught",
      label: "Pause on uncaught exceptions.",
      headerLabel: "Uncaught",
      shouldPause: true,
      shouldIgnoreCaught: true,
    },
    {
      mode: "with-caught",
      label: "Pause on all exceptions",
      headerLabel: "All",
      shouldPause: true,
      shouldIgnoreCaught: false,
    },
  ];
}

function _getCurrentPauseExceptionMode(state) {
  const shouldPause = getShouldPauseOnExceptions(state);
  const shouldIgnoreCaught = getShouldIgnoreCaughtExceptions(state);

  if (shouldPause) {
    if (shouldIgnoreCaught) {
      return _getModes().filter(item => item.mode === "no-caught")[0];
    }

    return _getModes().filter(item => item.mode === "with-caught")[0];
  }

  return _getModes().filter(item => item.mode === "no-pause")[0];
}

export default connect(
  (state, props) => ({
    breakpoints: _getBreakpoints(state),
    exceptionPauseModes: _getModes(),
    currentExceptionPauseMode: _getCurrentPauseExceptionMode(state),
  }),
  dispatch => bindActionCreators(actions, dispatch)
)(Breakpoints);
