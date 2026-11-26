import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

export function T3Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const aspectRatio = 96 / 57;
  return (
    <Svg
      accessibilityLabel="P4"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="0 0 96 57"
    >
      <ThemedPath
        d="M0 0H27C38 0 46 7.5 46 18.5C46 29.5 38 37 27 37H13V57H0ZM13 10.5V26.5H26C30.6 26.5 33 23.4 33 18.5C33 13.6 30.6 10.5 26 10.5ZM76 0H90V36H96V47H90V57H77V47H50V37ZM77 36V17L64 36Z"
        fillRule="evenodd"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
