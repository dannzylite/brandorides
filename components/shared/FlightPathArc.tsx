import { Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing } from '@/constants/theme';

interface FlightPathArcProps {
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

const screenWidth = Dimensions.get('window').width;

export function FlightPathArc({
  width = screenWidth - Spacing.lg * 2,
  height = 48,
  color = Colors.primaryLight,
  strokeWidth = 1.5,
}: FlightPathArcProps) {
  return (
    <Svg width={width} height={height}>
      <Path
        d={`M0,${height} Q${width / 2},0 ${width},${height}`}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
