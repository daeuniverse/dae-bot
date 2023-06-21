const useRegex = (input: string) => {
  let rcMatch = /v[0-9]+\.[0-9]+\.[0-9]+rc[0-9]+/;
  let pMatch = /v[0-9]+\.[0-9]+\.[0-9]+p[0-9]+/;
  let rmatch = /v[0-9]+\.[0-9]+\.[0-9]/;
  if (rcMatch.test(input)) {
    return input.match(rcMatch);
  } else if (pMatch.test(input)) {
    return input.match(pMatch);
  } else {
    return input.match(rmatch);
  }
};

console.log(useRegex("@daebot proceed to release-v0.1.0rc2"));
