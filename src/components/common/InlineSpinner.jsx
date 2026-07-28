import React from "react";
import PropTypes from "prop-types";

export default function InlineSpinner({
  size = 16,
  variant = "light", // light | dark | primary | danger
}) {
  let borderColor = "rgba(255,255,255,0.3)";
  let topColor = "currentColor";

  if (variant === "dark") {
    borderColor = "rgba(0,0,0,0.2)";
    topColor = "#000";
  }

  if (variant === "primary") {
    borderColor = "rgba(255,255,255,0.3)";
    topColor = "var(--primary)";
  }

  if (variant === "danger") {
    borderColor = "rgba(220,38,38,0.2)";
    topColor = "var(--danger)";
  }

  return (
    <span
      className="spinner"
      style={{
        width: size,
        height: size,
        border: `${size / 5}px solid ${borderColor}`,
        borderTop: `${size / 5}px solid ${topColor}`,
      }}
    />
  );
}

InlineSpinner.propTypes = {
  size: PropTypes.number,
  variant: PropTypes.string
};