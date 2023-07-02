const defaultLables = [
  "fix",
  "feat",
  "feature",
  "patch",
  "ci",
  "optimize",
  "chore",
  "refactor",
  "style",
  "doc",
  "docs",
  "fixture",
];

const testLabelRegex = (input: string): string[] => {
  return defaultLables
    .filter((label: string) => {
      const re = /^(?<type>\w+)(\((?<scope>.+)\))?:/;
      const { type } = input.match(re)?.groups!;
      return type === label;
    })
    .map((item) => {
      if (item == "feat") item = "feature";
      if (item == "docs" || item == "doc") item = "documentation";
      return item;
    });
};

const prTitle1 = "fixture(context): some title";
const prTitle2 = "fix(context): some title";
const prTitle3 = "docs(context): some title";
const prTitle4 = "docu(context): some title";
const prTitle5 = "feat: display daed version in header";

console.log(testLabelRegex(prTitle1));
console.log(testLabelRegex(prTitle2));
console.log(testLabelRegex(prTitle3));
console.log(testLabelRegex(prTitle4));
console.log(testLabelRegex(prTitle5));
