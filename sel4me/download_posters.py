#!/usr/bin/env python3
"""
SEL4ME Video Poster Downloader
Downloads video thumbnail/poster images into assets/all/
"""
import os, urllib.request, time, argparse

POSTERS = {
  "famous_failures_video_1.jpg": "https://cdn-static.suite360sel.org/suite360video/famous_failures_video_1.jpg",
  "01_what_is_grit4b.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/01_what_is_grit4b.jpg",
  "tobacco_alcohol_and_saying_no_video_1.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/tobacco_alcohol_and_saying_no_video_1.jpg",
  "crossing_the_line_video_1.jpg": "https://cdn-static.suite360sel.org/suite360video/crossing_the_line_video_1.jpg",
  "crossing_the_line_video_2.jpg": "https://cdn-static.suite360sel.org/suite360video/crossing_the_line_video_2.jpg",
  "book_trailer_the_little_engine_that_could3.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/book_trailer_the_little_engine_that_could3.jpg",
  "snickers_commercial_with_joe_pesci_and_don_rickles.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/snickers_commercial_with_joe_pesci_and_don_rickles.jpg",
  "a_teacher_uses_apples_to_deliver_a_powerful_lesson_about_bullying_goo.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/a_teacher_uses_apples_to_deliver_a_powerful_lesson_about_bullying_goo.jpg",
  "what_is_your_reputation_heres_why_its_important2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/what_is_your_reputation_heres_why_its_important2.jpg",
  "protecting_reputations_online2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/protecting_reputations_online2.jpg",
  "sore_winners_and_losers_video_1.jpg": "https://cdn-static.suite360sel.org/suite360video/sore_winners_and_losers_video_1.jpg",
  "alistair_brownlee_helping_brother_jonny_finish_his_triathlon_sacrificing_his_chance_of_winning.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/alistair_brownlee_helping_brother_jonny_finish_his_triathlon_sacrificing_his_chance_of_winning.jpg",
  "sooo_funny_getting_dizzy_and_falling.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/sooo_funny_getting_dizzy_and_falling.jpg",
  "anti_bullying_video_it_only_takes_one.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/anti_bullying_video_it_only_takes_one.jpg",
  "Mrs_Johnson_3rd_GradeWritersWorkshop.jpg": "https://cdn-static.suite360sel.org/suite360video/Mrs_Johnson_3rd_GradeWritersWorkshop.jpg",
  "put_yourself_in_someone_elses_shoes.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/put_yourself_in_someone_elses_shoes.jpg",
  "speak_out_how_can_you_stop_bullying_video_3.jpg": "https://cdn-static.suite360sel.org/suite360video/speak_out_how_can_you_stop_bullying_video_3.jpg",
  "boy_puts_himself_in_someone_elses_shoes_inspirational.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/boy_puts_himself_in_someone_elses_shoes_inspirational.jpg",
  "this_girl_was_getting_bullied_how_these_people_reacted_will_amaze_you.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/this_girl_was_getting_bullied_how_these_people_reacted_will_amaze_you.jpg",
  "the_bullying_experiment.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/the_bullying_experiment.jpg",
  "your_emotions_are_showing_video_1.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/your_emotions_are_showing_video_1.jpg",
  "your_emotions_are_showing_video_2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/your_emotions_are_showing_video_2.jpg",
  "interview_dos_and_donts.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/interview_dos_and_donts.jpg",
  "11_best_qualities_of_a_good_employee.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/11_best_qualities_of_a_good_employee.jpg",
  "making_tough_choices_with_kid_president1a.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/making_tough_choices_with_kid_president1a.jpg",
  "peanuts_teacher_calls_out_charlie_brown_linus_wah_wa_wa_1969.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/peanuts_teacher_calls_out_charlie_brown_linus_wah_wa_wa_1969.jpg",
  "building_your_systems_taking_notes_and_organizing_materials_video.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/building_your_systems_taking_notes_and_organizing_materials_video.jpg",
  "TheSchoolWithNoRules.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/TheSchoolWithNoRules.jpg",
  "how_to_create_a_study_space2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/how_to_create_a_study_space2.jpg",
  "mnemonic_devices2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/mnemonic_devices2.jpg",
  "real_life_drug_story_videos_drug_addiction_experiencesteenage_drugs_stories.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/real_life_drug_story_videos_drug_addiction_experiencesteenage_drugs_stories.jpg",
  "real_life_drug_story_videos_drug_addiction_experiencesteenage_drugs_stories_part_2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/real_life_drug_story_videos_drug_addiction_experiencesteenage_drugs_stories_part_2.jpg",
  "otc_drug_sending_teens_to_hospital.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/otc_drug_sending_teens_to_hospital.jpg",
  "dangers_of_prescription_drug_use.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/dangers_of_prescription_drug_use.jpg",
  "how_alcohol_affects_your_developing_brain.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/how_alcohol_affects_your_developing_brain.jpg",
  "effects_of_cannabis_on_the_teenage_brain_ncpic_turning_point.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/effects_of_cannabis_on_the_teenage_brain_ncpic_turning_point.jpg",
  "self_regulation_skills_why_they_are_fundamental2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/self_regulation_skills_why_they_are_fundamental2.jpg",
  "reflect_on_yourself_video.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/reflect_on_yourself_video.jpg",
  "what_is_medicine_video_1.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/what_is_medicine_video_1.jpg",
  "why_you_do_your_best_thinking_in_the_shower_supersoul_sunday_oprah_winfrey_network3c.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/why_you_do_your_best_thinking_in_the_shower_supersoul_sunday_oprah_winfrey_network3c.jpg",
  "sat_preparation_tip_how_to_create_an_effective_study_plan2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/sat_preparation_tip_how_to_create_an_effective_study_plan2.jpg",
  "pace_yourself_mindful_minute_video_1.jpg": "https://cdn-static.suite360sel.org/suite360video/pace_yourself_mindful_minute_video_1.jpg",
  "help_you_control_anxiety_before_a_test3.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/help_you_control_anxiety_before_a_test3.jpg",
  "inhalants_psa2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/inhalants_psa2.jpg",
  "i_decide.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/i_decide.jpg",
  "no_thanks.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/no_thanks.jpg",
  "poetry_in_motion_oracle_team_usas_17_at_sail_on_great_sound_in_bermuda.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/poetry_in_motion_oracle_team_usas_17_at_sail_on_great_sound_in_bermuda.jpg",
  "recovering_heroin_addict_cody_lewis_discusses_his_battle_with_addiction_on_windy_city_live.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/recovering_heroin_addict_cody_lewis_discusses_his_battle_with_addiction_on_windy_city_live.jpg",
  "mission_possible_lifelong_learning2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/mission_possible_lifelong_learning2.jpg",
  "the_7_habits2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/the_7_habits2.jpg",
  "target_tantrum2.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/target_tantrum2.jpg",
  "can_you_watch_this_without_yawning2b.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/can_you_watch_this_without_yawning2b.jpg",
  "inside_the_actors_studio_hugh_jackman_second_visit_how_to_have_emotion.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/inside_the_actors_studio_hugh_jackman_second_visit_how_to_have_emotion.jpg",
  "balloon_popping_in_slow_motion.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/balloon_popping_in_slow_motion.jpg",
  "Own_Your_Actions.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/Own_Your_Actions.jpg",
  "How_To_Handle_Peer_Pressure.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/How_To_Handle_Peer_Pressure.jpg",
  "teen_accused_of_being_a_bully_somebody_has_to_tell_people_theyre_ugly.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/teen_accused_of_being_a_bully_somebody_has_to_tell_people_theyre_ugly.jpg",
  "bullying_you_can_stop_it.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/bullying_you_can_stop_it.jpg",
  "how_marijuana_affects_the_adolescent_brain_new_university_of_maryland_school_of_medicine_research.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/how_marijuana_affects_the_adolescent_brain_new_university_of_maryland_school_of_medicine_research.jpg",
  "from_honor_student_to_heroin_addict.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/from_honor_student_to_heroin_addict.jpg",
  "how_alcohol_affects_the_brain.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/how_alcohol_affects_the_brain.jpg",
  "underage_dringking_drunkorexia.jpg": "https://cdn-static.suite360sel.org/suite360video/underage_dringking_drunkorexia.jpg",
  "team_spirit_and_cooperation_video.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/team_spirit_and_cooperation_video.jpg",
  "multiple_perspectives_part_1_the_honest_student.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/multiple_perspectives_part_1_the_honest_student.jpg",
  "multiple_perspectives_part_2_the_cheating_student.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/multiple_perspectives_part_2_the_cheating_student.jpg",
  "how_to_survive_a_hydroplane_event.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/how_to_survive_a_hydroplane_event.jpg",
  "animal_rejoins_the_muppets_at_anger_managment_in_control.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/animal_rejoins_the_muppets_at_anger_managment_in_control.jpg",
  "kids_song_practice_makes_perfect_hip_hop_harry.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/kids_song_practice_makes_perfect_hip_hop_harry.jpg",
  "ezra_frech_gives_motivational_speech_to_warriors_1.jpg": "https://cdn-static.suite360sel.org/suite360video/activities/ezra_frech_gives_motivational_speech_to_warriors_1.jpg"
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='assets/all', help='Output folder')
    args = parser.parse_args()
    
    os.makedirs(args.output, exist_ok=True)
    
    downloaded = 0
    skipped = 0
    failed = 0
    
    print(f"Downloading {len(POSTERS)} video poster images...")
    
    for fname, url in POSTERS.items():
        dest = os.path.join(args.output, fname)
        if os.path.exists(dest):
            skipped += 1
            continue
        
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            urllib.request.urlretrieve(url, dest)
            downloaded += 1
            print(f"  [{downloaded}] {fname}")
        except Exception as e:
            failed += 1
            print(f"  FAILED: {fname} - {e}")
        
        time.sleep(0.2)
    
    print(f"\nDone: {downloaded} downloaded, {skipped} skipped, {failed} failed")

if __name__ == '__main__':
    main()
