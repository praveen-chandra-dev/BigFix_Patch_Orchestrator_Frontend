export const getErrorMessage = (err, fallback = "Something went wrong") => {
  if (!err) return fallback;

  // Axios error
  if (err.response) {
    const data = err.response.data;

    // handle common backend formats
    const msg =
      data?.error ||
      data?.message ||
      data?.details ||
      (typeof data === "string" ? data : null);

    return msg || fallback;
  }

  // Network error
  if (err.request) {
    return "Network error. Please check your connection.";
  }

  return err.message || fallback;
};