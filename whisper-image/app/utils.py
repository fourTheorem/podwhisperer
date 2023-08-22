from moviepy.editor import VideoFileClip

def extract_audio_from_mp4(input_path, output_path='output_audio.mp3'):
    video_clip = VideoFileClip(input_path)
    audio_clip = video_clip.audio
    audio_clip.write_audiofile(output_path)
    audio_clip.close()
    video_clip.close()
    return output_path




