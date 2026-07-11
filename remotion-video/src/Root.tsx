import { Composition } from 'remotion'
import { Trailer } from './components/Trailer'

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Trailer"
      component={Trailer}
      durationInFrames={828}
      fps={30}
      width={1920}
      height={1080}
    />
  )
}
